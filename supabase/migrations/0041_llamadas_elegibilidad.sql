-- ============================================================================
-- CRM Rhinoboots — Llamadas de cartera: quiénes entran, carga diaria que se
-- acumula, aviso de cartera agotada y depuración de las listas actuales.
--
-- Entra a la lista solo el cliente que cumple TODO:
--   · su última compra fue hace más de 6 meses (o nunca compró),
--   · no tiene ninguna oportunidad abierta (Ventas, Licitaciones, Recuperación),
--   · no está descartado, ni ligado a otra razón social que se trabaja, ni con
--     "ya tiene gestión activa",
--   · no se le registró una llamada en los últimos 30 días (no le interesa: 6
--     meses; gestión activa y otra razón social: 90 días),
--   · es de la cartera del vendedor.
-- La fecha de última compra es la más reciente entre las ventas registradas en
-- el CRM (ventas_cerradas) y la fecha importada del historial (clientes.ultima_compra).
-- ============================================================================

-- Las llamadas que el cliente pidió reprogramar ("llámame después") no cuentan
-- dentro de las 10 nuevas del día.
alter table tareas add column if not exists reprogramada boolean not null default false;
update tareas t set reprogramada = true
 where t.tipo = 'llamada_cartera' and not t.reprogramada
   and exists (
     select 1 from llamadas l
      where l.cliente_id = t.cliente_id and l.resultado = 'llamar_despues'
        and abs(extract(epoch from (l.creado_en - t.created_at))) < 5
   );

-- Aviso a la administración: al vendedor no le alcanzaron clientes para sus 10 nuevos.
create table if not exists llamadas_cartera_avisos (
  dia date not null,
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  faltaron int not null check (faltaron > 0),
  creado_en timestamptz not null default now(),
  primary key (dia, vendedor_id)
);
alter table llamadas_cartera_avisos enable row level security;
drop policy if exists "llamadas_cartera_avisos_select" on llamadas_cartera_avisos;
create policy "llamadas_cartera_avisos_select" on llamadas_cartera_avisos for select to authenticated
  using (es_admin() or vendedor_id in (select vendedores_de_mi_unidad()));
-- Sin políticas de escritura: solo las escribe asignar_llamadas_diarias().

-- ----------------------------------------------------------------------------
-- Última compra del cliente.
-- ----------------------------------------------------------------------------
create or replace function ultima_compra_cliente(p_cliente uuid)
returns date as $$
  select greatest(
    (select max(fecha_cierre)::date from ventas_cerradas where cliente_id = p_cliente),
    (select ultima_compra from clientes where id = p_cliente)
  );
$$ language sql stable security definer set search_path = public;

revoke all on function ultima_compra_cliente(uuid) from public;
revoke all on function ultima_compra_cliente(uuid) from authenticated;
grant execute on function ultima_compra_cliente(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- ¿Puede entrar el cliente a la lista de llamadas? Devuelve null si SÍ puede, o
-- la razón por la que no. Es la única regla: la usan la carga diaria y la limpieza.
-- ----------------------------------------------------------------------------
create or replace function motivo_no_apto_llamada(p_cliente uuid, p_dia date default current_date)
returns text as $$
declare
  c clientes%rowtype;
  v_ult date;
begin
  select * into c from clientes where id = p_cliente;
  if not found then return 'no_existe'; end if;
  if c.descartado then return 'descartado'; end if;
  if c.dueno_comercial_id is null then return 'sin_dueno'; end if;
  if nullif(trim(c.telefono), '') is null and nullif(trim(c.email), '') is null then return 'sin_contacto'; end if;

  v_ult := ultima_compra_cliente(c.id);
  if v_ult is not null and v_ult >= (p_dia - interval '6 months')::date then return 'compra_reciente'; end if;

  if exists (select 1 from oportunidades o where o.cliente_id = c.id and o.estado_cierre = 'abierta') then
    return 'oportunidad_abierta';
  end if;

  if exists (
    select 1 from llamadas l
     where l.cliente_id = c.id
       and l.creado_en > now() - (case l.resultado
             when 'contesto_no_interesa' then interval '180 days'
             when 'gestion_activa' then interval '90 days'
             when 'misma_razon_social' then interval '90 days'
             else interval '30 days' end)
  ) then
    return 'llamada_reciente';
  end if;

  if (select count(*) from llamadas l where l.cliente_id = c.id and l.resultado = 'no_contesto') >= 3 then
    return 'tres_intentos';
  end if;

  if c.grupo_id is not null and exists (
    select 1 from llamadas l join clientes c2 on c2.id = l.cliente_relacionado_id
     where l.cliente_id = c.id and l.resultado = 'misma_razon_social' and c2.grupo_id = c.grupo_id
  ) then
    return 'otra_razon_social';
  end if;

  if exists (
    select 1 from llamadas l join oportunidades og on og.id = l.oportunidad_gestion_id
     where l.cliente_id = c.id and l.resultado = 'gestion_activa' and og.estado_cierre = 'abierta'
  ) then
    return 'gestion_activa';
  end if;

  return null;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke all on function motivo_no_apto_llamada(uuid, date) from public;
revoke all on function motivo_no_apto_llamada(uuid, date) from authenticated;
grant execute on function motivo_no_apto_llamada(uuid, date) to service_role;

-- ----------------------------------------------------------------------------
-- Carga diaria (6:00 a.m. de México): a cada vendedor del programa se le cargan
-- su meta de clientes NUEVOS, sin importar cuántas llamadas tenga pendientes.
-- Lo que no registró ayer se queda como atrasado y se acumula con lo nuevo.
-- Se puede correr varias veces el mismo día: no duplica (cuenta las ya cargadas).
-- ----------------------------------------------------------------------------
drop function if exists asignar_llamadas_diarias(date);
create or replace function asignar_llamadas_diarias(p_dia date default current_date)
returns table (vendedor text, pendientes_antes int, asignadas int, faltaron int) as $$
declare
  v record;
  v_pend int;
  v_ya int;
  v_need int;
  v_ins int;
  v_falto int;
begin
  for v in
    select id, nombre, meta_llamadas_diarias as meta from vendedores
    where activo and coalesce(meta_llamadas_diarias, 0) > 0
  loop
    select count(*) into v_pend from tareas
     where tipo = 'llamada_cartera' and estado = 'pendiente'
       and dueno_comercial_id = v.id and fecha_vencimiento < p_dia;

    select count(*) into v_ya from tareas
     where tipo = 'llamada_cartera' and not reprogramada and estado <> 'cancelada'
       and dueno_comercial_id = v.id and fecha_vencimiento = p_dia;

    v_need := greatest(v.meta - v_ya, 0);
    v_ins := 0;

    if v_need > 0 then
      with candidatos as (
        select c.id, c.empresa
        from clientes c
        where c.dueno_comercial_id = v.id and not c.descartado
          and not exists (select 1 from tareas t where t.tipo = 'llamada_cartera' and t.cliente_id = c.id and t.estado = 'pendiente')
          and motivo_no_apto_llamada(c.id, p_dia) is null
        order by (c.nivel_cuenta = 'Estratégica') desc, c.total_historico desc nulls last,
                 c.ultima_compra desc nulls last, c.empresa
        limit v_need
      ), ins as (
        insert into tareas (tipo, titulo, fecha_vencimiento, cliente_id, dueno_comercial_id, reprogramada)
        select 'llamada_cartera', 'Llamar a ' || empresa, p_dia, id, v.id, false from candidatos
        returning 1
      )
      select count(*) into v_ins from ins;
    end if;

    v_falto := v_need - v_ins;
    if v_falto > 0 then
      insert into llamadas_cartera_avisos (dia, vendedor_id, faltaron) values (p_dia, v.id, v_falto)
      on conflict (dia, vendedor_id) do update set faltaron = excluded.faltaron, creado_en = now();
    else
      delete from llamadas_cartera_avisos where dia = p_dia and vendedor_id = v.id;
    end if;

    vendedor := v.nombre; pendientes_antes := v_pend; asignadas := v_ins; faltaron := greatest(v_falto, 0);
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function asignar_llamadas_diarias(date) from public;
revoke all on function asignar_llamadas_diarias(date) from authenticated;
grant execute on function asignar_llamadas_diarias(date) to service_role;

-- ----------------------------------------------------------------------------
-- Limpieza de las listas actuales: quita las llamadas pendientes de clientes que
-- ya no cumplen la regla. No cuentan como registradas ni como no hechas (quedan
-- canceladas con motivo 'depuracion_lista'; no se borra nada). Las reprogramadas
-- por el cliente no se tocan. Con p_aplicar = false solo cuenta (simulacro).
-- ----------------------------------------------------------------------------
create or replace function depurar_lista_llamadas(p_dia date default current_date, p_aplicar boolean default false)
returns table (vendedor text, motivo text, llamadas int) as $$
begin
  return query
  with revisadas as (
    select t.id, t.dueno_comercial_id, motivo_no_apto_llamada(t.cliente_id, p_dia) as razon
    from tareas t
    where t.tipo = 'llamada_cartera' and t.estado = 'pendiente' and not t.reprogramada
  ), quitar as (
    select * from revisadas where razon is not null
  ), aplicadas as (
    update tareas t set estado = 'cancelada', motivo_cierre = 'depuracion_lista'
     where p_aplicar and t.id in (select id from quitar)
    returning t.id
  )
  select coalesce(v.nombre, 'Sin asignar')::text, q.razon::text, count(*)::int
  from quitar q left join vendedores v on v.id = q.dueno_comercial_id
  group by 1, 2
  order by 1, 2;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function depurar_lista_llamadas(date, boolean) from public;
revoke all on function depurar_lista_llamadas(date, boolean) from authenticated;
grant execute on function depurar_lista_llamadas(date, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- registrar_llamada: igual que antes, pero la llamada reprogramada queda marcada.
-- ----------------------------------------------------------------------------
create or replace function registrar_llamada(
  p_tarea uuid, p_resultado text, p_nota text, p_fecha date, p_hora time,
  p_cliente_rel uuid default null, p_vendedor uuid default null,
  p_oportunidad_gestion uuid default null, p_motivo text default null
) returns uuid as $$
declare
  t tareas%rowtype;
  v_op uuid;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_rel clientes%rowtype;
  v_g1 uuid;
  v_g2 uuid;
  v_gnuevo uuid;
  v_label text;
begin
  select * into t from tareas where id = p_tarea and tipo = 'llamada_cartera';
  if not found then
    raise exception 'No se encontró esa llamada.';
  end if;
  if not (es_admin() or t.dueno_comercial_id = mi_vendedor_id()) then
    raise exception 'Esta llamada no es tuya.';
  end if;
  if t.estado <> 'pendiente' then
    raise exception 'Esta llamada ya se registró.';
  end if;
  if p_resultado not in ('contesto_interesado','contesto_no_interesa','no_contesto','numero_equivocado',
                         'llamar_despues','misma_razon_social','gestion_activa','no_apto','otro') then
    raise exception 'Elige qué pasó con la llamada.';
  end if;
  if p_resultado in ('misma_razon_social','gestion_activa','no_apto','otro')
     and (v_nota is null or length(v_nota) < 3) then
    raise exception 'Escribe un comentario: es obligatorio en esta opción.';
  end if;
  if p_resultado = 'llamar_despues' and p_fecha is null then
    raise exception 'Indica cuándo pidió que le llamen.';
  end if;

  if p_resultado = 'contesto_interesado' then
    if not exists (select 1 from oportunidades where cliente_id = t.cliente_id and estado_cierre = 'abierta') then
      insert into oportunidades (cliente_id, pipeline, etapa, dueno_comercial_id, notas)
      values (t.cliente_id, 'ventas', 'Contacto efectivo', t.dueno_comercial_id,
              'Nació de una llamada de cartera.' || coalesce(' ' || v_nota, ''))
      returning id into v_op;
    end if;

  elsif p_resultado = 'numero_equivocado' then
    update clientes set telefono = null where id = t.cliente_id;

  elsif p_resultado = 'llamar_despues' then
    insert into tareas (tipo, titulo, fecha_vencimiento, hora_vencimiento, cliente_id, dueno_comercial_id, detalle, reprogramada)
    select 'llamada_cartera', t.titulo, p_fecha, p_hora, t.cliente_id, t.dueno_comercial_id, v_nota, true;

  elsif p_resultado = 'misma_razon_social' then
    if p_cliente_rel is null or p_cliente_rel = t.cliente_id then
      raise exception 'Elige la razón social con la que sí se trabaja.';
    end if;
    select * into v_rel from clientes where id = p_cliente_rel;
    if not found then
      raise exception 'No se encontró esa razón social.';
    end if;
    select grupo_id into v_g1 from clientes where id = t.cliente_id;
    v_g2 := v_rel.grupo_id;
    if v_g1 is null and v_g2 is null then
      select id into v_gnuevo from grupos_clientes where lower(trim(nombre)) = lower(trim(v_rel.empresa));
      if v_gnuevo is null then
        insert into grupos_clientes (nombre, creado_por) values (trim(v_rel.empresa), mi_vendedor_id())
        returning id into v_gnuevo;
      end if;
      update clientes set grupo_id = v_gnuevo where id in (t.cliente_id, p_cliente_rel);
    elsif v_g1 is null then
      update clientes set grupo_id = v_g2 where id = t.cliente_id;
    elsif v_g2 is null then
      update clientes set grupo_id = v_g1 where id = p_cliente_rel;
    elsif v_g1 <> v_g2 then
      update clientes set grupo_id = v_g2 where id = t.cliente_id;
    end if;

  elsif p_resultado = 'gestion_activa' then
    if p_vendedor is null then
      raise exception 'Indica quién lo trabaja.';
    end if;
    if p_oportunidad_gestion is not null and not exists (
         select 1 from oportunidades where id = p_oportunidad_gestion and cliente_id = t.cliente_id) then
      raise exception 'Esa oportunidad no es de este cliente.';
    end if;

  elsif p_resultado = 'no_apto' then
    v_label := case p_motivo
      when 'cerro_no_opera' then 'Cerró o ya no opera'
      when 'no_compra_calzado' then 'Ya no compra calzado de seguridad'
      when 'mal_historial_pago' then 'Mal historial de pago'
      when 'solo_precio' then 'Solo compra por precio, no es nuestro mercado'
      when 'contrato_exclusivo' then 'Contrato exclusivo con otro proveedor'
      when 'pidio_no_contacto' then 'Pidió no ser contactado'
      when 'otro' then 'Otro'
      else null end;
    if v_label is null then
      raise exception 'Elige el motivo por el que no es apto.';
    end if;
    update clientes set descartado = true, motivo_descarte = v_nota, motivo_descarte_tipo = p_motivo,
           descartado_en = now(), descartado_por = mi_vendedor_id()
     where id = t.cliente_id;
    -- Sale de cualquier pipeline: se cierran sus oportunidades abiertas (conservando todo).
    update oportunidades
       set estado_cierre = 'perdida',
           etapa = case pipeline when 'ventas' then 'Cerrada Perdida' when 'licitaciones' then 'Perdida' else 'Cerrada sin éxito' end,
           motivo_perdida = 'otro',
           motivo_perdida_detalle = 'No apto para Rhinoboots: ' || v_label,
           fecha_cierre = now()
     where cliente_id = t.cliente_id and estado_cierre = 'abierta';
    update tareas set estado = 'cancelada', motivo_cierre = 'descartado'
     where cliente_id = t.cliente_id and estado = 'pendiente' and id <> p_tarea;
  end if;

  update tareas set estado = 'completada', completada_at = now(), nota = v_nota where id = p_tarea;
  insert into llamadas (cliente_id, vendedor_id, tarea_id, resultado, nota, oportunidad_id,
                        cliente_relacionado_id, gestionado_por_id, oportunidad_gestion_id, motivo)
  values (t.cliente_id, t.dueno_comercial_id, p_tarea, p_resultado, v_nota, v_op,
          case when p_resultado = 'misma_razon_social' then p_cliente_rel end,
          case when p_resultado = 'gestion_activa' then p_vendedor end,
          case when p_resultado = 'gestion_activa' then p_oportunidad_gestion end,
          case when p_resultado = 'no_apto' then p_motivo end);
  return v_op;
end;
$$ language plpgsql security definer set search_path = public;
