-- ============================================================================
-- CRM Rhinoboots — bitácora de ventas cerradas (pestaña "Ventas")
-- Pégalo en el SQL Editor de Supabase y dale "Run".
--
-- Se llena SOLA: cada vez que una oportunidad llega a su etapa final ganadora
-- (Ventas → "Cerrada Ganada", Licitaciones → "Adjudicada",
-- Recuperación → "Reactivada"), se crea o actualiza su registro aquí.
-- El único campo que se captura a mano es "factura" (cuando exista).
-- ============================================================================

create table if not exists ventas_cerradas (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null unique references oportunidades(id) on delete cascade,
  fecha_cierre timestamptz not null,
  cliente_id uuid references clientes(id),
  empresa text not null,
  dueno_comercial_id uuid references vendedores(id),
  vendedor_nombre text,
  unidad_negocio text,
  pipeline text not null check (pipeline in ('ventas', 'licitaciones', 'recuperacion')),
  tipo_venta text not null check (tipo_venta in ('Nuevo', 'Expansión', 'Recompra', 'Licitación')),
  factura text,
  pares_vendidos numeric,
  total_facturado numeric,
  precio_promedio numeric generated always as (
    case when pares_vendidos > 0 then round(total_facturado / pares_vendidos, 2) else null end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ventas_cerradas_dueno_idx on ventas_cerradas (dueno_comercial_id, fecha_cierre);
create index if not exists ventas_cerradas_fecha_idx on ventas_cerradas (fecha_cierre);

drop trigger if exists ventas_cerradas_set_updated_at on ventas_cerradas;
create trigger ventas_cerradas_set_updated_at
  before update on ventas_cerradas
  for each row execute function set_updated_at();

alter table ventas_cerradas enable row level security;

drop policy if exists "ventas_cerradas_select" on ventas_cerradas;
create policy "ventas_cerradas_select" on ventas_cerradas
  for select to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id());

-- Solo se permite editar el campo "factura" desde la app; lo demás lo
-- mantiene sincronizado el trigger automáticamente.
drop policy if exists "ventas_cerradas_update" on ventas_cerradas;
create policy "ventas_cerradas_update" on ventas_cerradas
  for update to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id())
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

drop policy if exists "ventas_cerradas_insert" on ventas_cerradas;
create policy "ventas_cerradas_insert" on ventas_cerradas
  for insert to authenticated
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

-- ----------------------------------------------------------------------------
-- Trigger: mantiene ventas_cerradas sincronizada con las oportunidades
-- ganadas de los 3 pipelines.
-- ----------------------------------------------------------------------------
create or replace function trg_registrar_venta_cerrada()
returns trigger as $$
declare
  v_empresa text;
  v_tipo_cliente text;
  v_vendedor_nombre text;
  v_unidad text;
  v_tipo_venta text;
  v_total numeric;
begin
  if new.estado_cierre = 'ganada' and (
       (new.pipeline = 'ventas' and new.etapa = 'Cerrada Ganada') or
       (new.pipeline = 'licitaciones' and new.etapa = 'Adjudicada') or
       (new.pipeline = 'recuperacion' and new.etapa = 'Reactivada')
     ) then

    select empresa, tipo_cliente into v_empresa, v_tipo_cliente
      from clientes where id = new.cliente_id;

    select nombre, unidad_negocio into v_vendedor_nombre, v_unidad
      from vendedores where id = new.dueno_comercial_id;

    if new.pipeline = 'licitaciones' then
      v_tipo_venta := 'Licitación';
      v_total := new.monto_estimado;
    elsif new.pipeline = 'recuperacion' then
      v_tipo_venta := 'Recompra';
      v_total := new.valor_estimado;
    else
      v_tipo_venta := case when v_tipo_cliente = 'Cartera' then 'Expansión' else 'Nuevo' end;
      v_total := new.valor_estimado;
    end if;

    insert into ventas_cerradas (
      oportunidad_id, fecha_cierre, cliente_id, empresa, dueno_comercial_id,
      vendedor_nombre, unidad_negocio, pipeline, tipo_venta,
      pares_vendidos, total_facturado
    ) values (
      new.id, coalesce(new.fecha_cierre, now()), new.cliente_id, coalesce(v_empresa, 'Cliente'),
      new.dueno_comercial_id, v_vendedor_nombre, v_unidad, new.pipeline, v_tipo_venta,
      new.pares_vendidos, v_total
    )
    on conflict (oportunidad_id) do update set
      fecha_cierre = excluded.fecha_cierre,
      cliente_id = excluded.cliente_id,
      empresa = excluded.empresa,
      dueno_comercial_id = excluded.dueno_comercial_id,
      vendedor_nombre = excluded.vendedor_nombre,
      unidad_negocio = excluded.unidad_negocio,
      pipeline = excluded.pipeline,
      tipo_venta = excluded.tipo_venta,
      pares_vendidos = excluded.pares_vendidos,
      total_facturado = excluded.total_facturado;
      -- "factura" nunca se toca aquí: se conserva lo que haya capturado el equipo.
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists oportunidades_venta_cerrada on oportunidades;
create trigger oportunidades_venta_cerrada
  after insert or update on oportunidades
  for each row execute function trg_registrar_venta_cerrada();

-- ----------------------------------------------------------------------------
-- Carga retroactiva: oportunidades que ya estaban ganadas antes de este cambio.
-- ----------------------------------------------------------------------------
insert into ventas_cerradas (
  oportunidad_id, fecha_cierre, cliente_id, empresa, dueno_comercial_id,
  vendedor_nombre, unidad_negocio, pipeline, tipo_venta, pares_vendidos, total_facturado
)
select
  o.id,
  coalesce(o.fecha_cierre, o.updated_at),
  o.cliente_id,
  coalesce(c.empresa, 'Cliente'),
  o.dueno_comercial_id,
  v.nombre,
  v.unidad_negocio,
  o.pipeline,
  case
    when o.pipeline = 'licitaciones' then 'Licitación'
    when o.pipeline = 'recuperacion' then 'Recompra'
    when c.tipo_cliente = 'Cartera' then 'Expansión'
    else 'Nuevo'
  end,
  o.pares_vendidos,
  case when o.pipeline = 'licitaciones' then o.monto_estimado else o.valor_estimado end
from oportunidades o
left join clientes c on c.id = o.cliente_id
left join vendedores v on v.id = o.dueno_comercial_id
where o.estado_cierre = 'ganada'
  and (
    (o.pipeline = 'ventas' and o.etapa = 'Cerrada Ganada') or
    (o.pipeline = 'licitaciones' and o.etapa = 'Adjudicada') or
    (o.pipeline = 'recuperacion' and o.etapa = 'Reactivada')
  )
on conflict (oportunidad_id) do nothing;
