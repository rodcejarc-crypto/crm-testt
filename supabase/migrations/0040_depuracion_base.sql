-- ============================================================================
-- CRM Rhinoboots — Depuración de la base desde las llamadas de cartera.
--
-- Nuevas respuestas al registrar una llamada: misma razón social, gestión
-- activa, no apto (descarte definitivo) y otro. "No le interesa" pasa a ser
-- temporal (vuelve a la lista en 6 meses). Más revisión de administración.
-- ============================================================================

-- ---- Descarte con motivo clasificado (los descartes viejos quedan sin clasificar).
alter table clientes add column if not exists motivo_descarte_tipo text
  check (motivo_descarte_tipo is null or motivo_descarte_tipo in (
    'cerro_no_opera', 'no_compra_calzado', 'mal_historial_pago', 'solo_precio',
    'contrato_exclusivo', 'pidio_no_contacto', 'otro'
  ));
create index if not exists clientes_motivo_descarte_idx on clientes (motivo_descarte_tipo);

-- ---- Llamadas: nuevos resultados y datos de apoyo.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'llamadas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%contesto_interesado%'
  loop
    execute 'alter table llamadas drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;
alter table llamadas add constraint llamadas_resultado_check
  check (resultado in ('contesto_interesado','contesto_no_interesa','no_contesto','numero_equivocado',
                       'llamar_despues','misma_razon_social','gestion_activa','no_apto','otro'));

alter table llamadas add column if not exists cliente_relacionado_id uuid references clientes(id) on delete set null;
alter table llamadas add column if not exists gestionado_por_id uuid references vendedores(id) on delete set null;
alter table llamadas add column if not exists oportunidad_gestion_id uuid references oportunidades(id) on delete set null;
alter table llamadas add column if not exists motivo text;
alter table llamadas add column if not exists revisado_en timestamptz;
alter table llamadas add column if not exists revisado_por uuid references vendedores(id) on delete set null;

-- (también la crea 0039; aquí por si se aplica sola)
alter table tareas add column if not exists motivo_cierre text;

-- "No le interesa" ahora es temporal (6 meses): los clientes que la versión
-- anterior dejó descartados por esa respuesta vuelven a estar activos. La
-- llamada queda en su historial y la regla de los 6 meses los mantiene fuera
-- de la lista.
update clientes
   set descartado = false, motivo_descarte = null, motivo_descarte_tipo = null,
       descartado_en = null, descartado_por = null
 where descartado and motivo_descarte like 'Llamada de cartera: no le interesa.%';

-- ---- Historial de acciones de administración sobre un cliente.
create table if not exists cliente_eventos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null,
  detalle text,
  por uuid references vendedores(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists cliente_eventos_idx on cliente_eventos (cliente_id, creado_en);
alter table cliente_eventos enable row level security;
drop policy if exists "cliente_eventos_select" on cliente_eventos;
create policy "cliente_eventos_select" on cliente_eventos for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_eventos.cliente_id));
-- Sin políticas de escritura: se escribe solo desde las funciones de abajo.

-- ----------------------------------------------------------------------------
-- Entrega diaria (reemplaza la de 0036): ahora excluye ligados a otra razón
-- social y con gestión activa, y cada respuesta tiene su propia espera:
--   no le interesa → 6 meses · otro → 30 días · el resto → 90 días.
-- ----------------------------------------------------------------------------
create or replace function asignar_llamadas_diarias(p_dia date default current_date)
returns table (vendedor text, pendientes_antes int, asignadas int) as $$
declare
  v record;
  v_pend int;
  v_need int;
  v_ins int;
begin
  for v in
    select id, nombre, meta_llamadas_diarias as meta from vendedores
    where activo and coalesce(meta_llamadas_diarias, 0) > 0
  loop
    select count(*) into v_pend from tareas
     where tipo = 'llamada_cartera' and estado = 'pendiente'
       and dueno_comercial_id = v.id and fecha_vencimiento <= p_dia;
    v_need := v.meta - v_pend;
    v_ins := 0;

    if v_need > 0 then
      with candidatos as (
        select c.id, c.empresa
        from clientes c
        where c.dueno_comercial_id = v.id and not c.descartado
          and (nullif(trim(c.telefono), '') is not null or nullif(trim(c.email), '') is not null)
          and not exists (select 1 from oportunidades o where o.cliente_id = c.id and o.estado_cierre = 'abierta')
          and not exists (
            select 1 from tareas t join oportunidades o on o.id = t.oportunidad_id
            where o.cliente_id = c.id and t.estado = 'completada' and t.completada_at > now() - interval '90 days'
          )
          and not exists (select 1 from visitas vi where vi.cliente_id = c.id and vi.estado = 'realizada' and vi.fecha > p_dia - 90)
          and not exists (select 1 from tareas t where t.tipo = 'llamada_cartera' and t.cliente_id = c.id and t.estado = 'pendiente')
          and not exists (
            select 1 from llamadas l
            where l.cliente_id = c.id and l.resultado <> 'no_contesto'
              and l.creado_en > now() - (case l.resultado
                    when 'contesto_no_interesa' then interval '180 days'
                    when 'otro' then interval '30 days'
                    else interval '90 days' end)
          )
          and (select count(*) from llamadas l where l.cliente_id = c.id and l.resultado = 'no_contesto') < 3
          and not exists (select 1 from llamadas l where l.cliente_id = c.id and l.resultado = 'no_contesto' and l.creado_en > now() - interval '5 days')
          -- ya se trabaja con otra razón social mientras siga ligada en el mismo grupo
          and not exists (
            select 1 from llamadas l join clientes c2 on c2.id = l.cliente_relacionado_id
            where l.cliente_id = c.id and l.resultado = 'misma_razon_social'
              and c.grupo_id is not null and c2.grupo_id = c.grupo_id
          )
          -- gestión activa con una oportunidad que sigue abierta
          and not exists (
            select 1 from llamadas l join oportunidades og on og.id = l.oportunidad_gestion_id
            where l.cliente_id = c.id and l.resultado = 'gestion_activa' and og.estado_cierre = 'abierta'
          )
        order by (c.nivel_cuenta = 'Estratégica') desc, c.total_historico desc nulls last,
                 c.ultima_compra desc nulls last, c.empresa
        limit v_need
      ), ins as (
        insert into tareas (tipo, titulo, fecha_vencimiento, cliente_id, dueno_comercial_id)
        select 'llamada_cartera', 'Llamar a ' || empresa, p_dia, id, v.id from candidatos
        returning 1
      )
      select count(*) into v_ins from ins;
    end if;

    vendedor := v.nombre; pendientes_antes := v_pend; asignadas := v_ins;
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function asignar_llamadas_diarias(date) from public;
revoke all on function asignar_llamadas_diarias(date) from authenticated;
grant execute on function asignar_llamadas_diarias(date) to service_role;

-- ----------------------------------------------------------------------------
-- Registrar el resultado de una llamada (reemplaza la de 0036).
-- ----------------------------------------------------------------------------
drop function if exists registrar_llamada(uuid, text, text, date, time);

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
    insert into tareas (tipo, titulo, fecha_vencimiento, hora_vencimiento, cliente_id, dueno_comercial_id, detalle)
    select 'llamada_cartera', t.titulo, p_fecha, p_hora, t.cliente_id, t.dueno_comercial_id, v_nota;

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

revoke all on function registrar_llamada(uuid, text, text, date, time, uuid, uuid, uuid, text) from public;
grant execute on function registrar_llamada(uuid, text, text, date, time, uuid, uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Administración: reactivar un cliente descartado (con motivo y registro).
-- ----------------------------------------------------------------------------
create or replace function reactivar_descartado(p_cliente uuid, p_motivo text)
returns void as $$
declare
  c clientes%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo la administración puede reactivar un cliente descartado.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo de la reactivación.';
  end if;
  select * into c from clientes where id = p_cliente;
  if not found or not c.descartado then
    raise exception 'Ese cliente no está descartado.';
  end if;
  insert into cliente_eventos (cliente_id, tipo, detalle, por)
  values (p_cliente, 'reactivado',
          'Reactivado. Motivo: ' || trim(p_motivo) ||
          ' (descartado antes por: ' || coalesce(c.motivo_descarte_tipo, 'sin clasificar') ||
          coalesce(' — ' || c.motivo_descarte, '') || ')',
          mi_vendedor_id());
  update clientes set descartado = false, motivo_descarte = null, motivo_descarte_tipo = null,
         descartado_en = null, descartado_por = null
   where id = p_cliente;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function reactivar_descartado(uuid, text) from public;
grant execute on function reactivar_descartado(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Administración: resolver un "cliente con dueño por revisar" (opción gestión
-- activa): reasignar al vendedor correcto (o dejarlo como está).
-- ----------------------------------------------------------------------------
create or replace function resolver_dueno_por_revisar(p_llamada uuid, p_nuevo_dueno uuid)
returns void as $$
declare
  l llamadas%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo la administración puede resolver esto.';
  end if;
  select * into l from llamadas where id = p_llamada and resultado = 'gestion_activa';
  if not found then
    raise exception 'No se encontró el registro.';
  end if;
  if p_nuevo_dueno is not null then
    update clientes set dueno_comercial_id = p_nuevo_dueno where id = l.cliente_id;
    insert into cliente_eventos (cliente_id, tipo, detalle, por)
    values (l.cliente_id, 'dueno_reasignado',
            'Reasignado a ' || coalesce((select nombre from vendedores where id = p_nuevo_dueno), '—') ||
            ' tras revisar la gestión activa reportada en una llamada.',
            mi_vendedor_id());
  end if;
  update llamadas set revisado_en = now(), revisado_por = mi_vendedor_id() where id = p_llamada;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function resolver_dueno_por_revisar(uuid, uuid) from public;
grant execute on function resolver_dueno_por_revisar(uuid, uuid) to authenticated;
