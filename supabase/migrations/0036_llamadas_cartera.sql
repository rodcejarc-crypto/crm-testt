-- ============================================================================
-- CRM Rhinoboots — Llamadas diarias a clientes sin atención.
--
-- Cada mañana el CRM entrega a cada vendedor del programa hasta N clientes
-- (por defecto 10) para llamar, como tareas "Llamar a [cliente]" en
-- Seguimientos. Van primero los clientes que más compraron antes. El vendedor
-- registra qué pasó con cada llamada y el CRM actúa según el resultado.
-- ============================================================================

-- Datos de compras anteriores (para decidir a quién llamar primero).
alter table clientes add column if not exists ultima_compra date;
alter table clientes add column if not exists total_historico numeric;

-- Meta diaria de llamadas por vendedor (null = no está en el programa).
alter table vendedores add column if not exists meta_llamadas_diarias int
  check (meta_llamadas_diarias is null or meta_llamadas_diarias >= 0);

-- Tipo de tarea nuevo.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'tareas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%seguimiento_venta%'
  loop
    execute 'alter table tareas drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;
alter table tareas add constraint tareas_tipo_check
  check (tipo in ('seguimiento_venta','seguimiento_recuperacion','seguimiento_licitacion',
                  'licitacion_entrega','checkin_cuenta_clave','llamada_cartera'));

create table if not exists llamadas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  vendedor_id uuid references vendedores(id) on delete set null,
  tarea_id uuid references tareas(id) on delete set null,
  resultado text not null
    check (resultado in ('contesto_interesado','contesto_no_interesa','no_contesto','numero_equivocado','llamar_despues')),
  nota text,
  oportunidad_id uuid references oportunidades(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists llamadas_cliente_idx on llamadas (cliente_id, creado_en);
create index if not exists llamadas_vendedor_idx on llamadas (vendedor_id, creado_en);

alter table llamadas enable row level security;
drop policy if exists "llamadas_select" on llamadas;
create policy "llamadas_select" on llamadas for select to authenticated
  using (
    es_admin() or vendedor_id = mi_vendedor_id()
    or vendedor_id in (select vendedores_de_mi_unidad())
  );
-- Sin políticas de escritura: todo pasa por registrar_llamada().

-- La meta de llamadas la fija solo la administración general.
create or replace function trg_bloquear_cambio_rol_o_unidad()
returns trigger as $$
begin
  if auth.uid() is not null and not es_admin() and (
    new.rol is distinct from old.rol
    or new.unidad_negocio is distinct from old.unidad_negocio
    or new.hace_visitas_campo is distinct from old.hace_visitas_campo
    or new.meta_llamadas_diarias is distinct from old.meta_llamadas_diarias
  ) then
    raise exception 'Solo un administrador general puede cambiar el rol, la unidad, las visitas de campo o la meta de llamadas.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- Entrega diaria: completa hasta la meta de cada vendedor del programa.
-- Un cliente es candidato si: es del vendedor, no está descartado, tiene
-- teléfono o correo, no tiene oportunidad abierta, no se le hizo seguimiento
-- ni visita en 90 días, no tiene ya una llamada pendiente, no se le contactó
-- en 90 días, y no se agotaron sus 3 intentos sin respuesta (con 5 días de
-- espera entre intentos). Orden: cuentas estratégicas, luego mayor compra
-- histórica, luego compra más reciente.
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
          and not exists (select 1 from llamadas l where l.cliente_id = c.id and l.resultado <> 'no_contesto' and l.creado_en > now() - interval '90 days')
          and (select count(*) from llamadas l where l.cliente_id = c.id and l.resultado = 'no_contesto') < 3
          and not exists (select 1 from llamadas l where l.cliente_id = c.id and l.resultado = 'no_contesto' and l.creado_en > now() - interval '5 days')
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
-- Registrar el resultado de una llamada.
-- ----------------------------------------------------------------------------
create or replace function registrar_llamada(
  p_tarea uuid, p_resultado text, p_nota text, p_fecha date, p_hora time
) returns uuid as $$
declare
  t tareas%rowtype;
  v_op uuid;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
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
  if p_resultado not in ('contesto_interesado','contesto_no_interesa','no_contesto','numero_equivocado','llamar_despues') then
    raise exception 'Elige qué pasó con la llamada.';
  end if;
  if p_resultado = 'contesto_no_interesa' and (v_nota is null or length(v_nota) < 3) then
    raise exception 'Escribe el motivo por el que no le interesa (queda guardado).';
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
  elsif p_resultado = 'contesto_no_interesa' then
    update clientes set descartado = true,
           motivo_descarte = 'Llamada de cartera: no le interesa. ' || v_nota,
           descartado_en = now(), descartado_por = mi_vendedor_id()
     where id = t.cliente_id;
  elsif p_resultado = 'numero_equivocado' then
    update clientes set telefono = null where id = t.cliente_id;
  elsif p_resultado = 'llamar_despues' then
    insert into tareas (tipo, titulo, fecha_vencimiento, hora_vencimiento, cliente_id, dueno_comercial_id, detalle)
    select 'llamada_cartera', t.titulo, p_fecha, p_hora, t.cliente_id, t.dueno_comercial_id, v_nota;
  end if;

  update tareas set estado = 'completada', completada_at = now(), nota = v_nota where id = p_tarea;
  insert into llamadas (cliente_id, vendedor_id, tarea_id, resultado, nota, oportunidad_id)
  values (t.cliente_id, t.dueno_comercial_id, p_tarea, p_resultado, v_nota, v_op);
  return v_op;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function registrar_llamada(uuid, text, text, date, time) from public;
grant execute on function registrar_llamada(uuid, text, text, date, time) to authenticated;

-- ----------------------------------------------------------------------------
-- Programa inicial: 10 llamadas al día (excepto Guadalajara y Pedro Castellón).
-- ----------------------------------------------------------------------------
update vendedores set meta_llamadas_diarias = 10
 where nombre in (
   'Reyna Guadalupe Ramirez Ordaz', 'Ma. Aurora Amezcua Alvarez', 'Gabino Ordaz Cendejas',
   'Jose Manuel Contreras Estrada', 'Maria de los Angeles Magdaleno Ortiz', 'Sarahi Galvan Garcia',
   'Nayeli Zavala', 'Guadalupe Chavez Castro'
 );
