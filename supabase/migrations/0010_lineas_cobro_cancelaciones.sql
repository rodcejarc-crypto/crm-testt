-- ============================================================================
-- CRM Rhinoboots — líneas de producto, estado de cobro y cancelaciones
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Desglose de una venta por línea de producto (opcional, informativo: debe
-- sumar al total de pares/facturado de la venta, pero no lo reemplaza).
-- ----------------------------------------------------------------------------
create table if not exists ventas_lineas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas_cerradas(id) on delete cascade,
  linea text not null check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico')),
  pares numeric not null default 0,
  monto numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ventas_lineas_venta_idx on ventas_lineas (venta_id);

alter table ventas_lineas enable row level security;

drop policy if exists "ventas_lineas_todo" on ventas_lineas;
create policy "ventas_lineas_todo" on ventas_lineas
  for all to authenticated
  using (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = venta_id and vc.dueno_comercial_id = mi_vendedor_id()
    )
  )
  with check (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = venta_id and vc.dueno_comercial_id = mi_vendedor_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Estado de cobro de la venta.
-- ----------------------------------------------------------------------------
alter table ventas_cerradas
  add column if not exists estado_cobro text not null default 'Pendiente'
    check (estado_cobro in ('Pendiente', 'Cobrada'));
alter table ventas_cerradas
  add column if not exists fecha_cobro date;

-- ----------------------------------------------------------------------------
-- Cancelaciones / devoluciones ligadas a una venta ya cerrada. Se descuentan
-- del período en que se REGISTRA la cancelación, no del mes de la venta
-- original (por eso llevan su propia fecha).
-- ----------------------------------------------------------------------------
create table if not exists ventas_cancelaciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas_cerradas(id) on delete cascade,
  fecha date not null default current_date,
  pares numeric not null default 0,
  monto numeric not null default 0,
  motivo text,
  registrado_por uuid references vendedores(id),
  created_at timestamptz not null default now()
);

create index if not exists ventas_cancelaciones_fecha_idx on ventas_cancelaciones (fecha);
create index if not exists ventas_cancelaciones_venta_idx on ventas_cancelaciones (venta_id);

alter table ventas_cancelaciones enable row level security;

drop policy if exists "ventas_cancelaciones_select" on ventas_cancelaciones;
create policy "ventas_cancelaciones_select" on ventas_cancelaciones
  for select to authenticated
  using (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = venta_id and vc.dueno_comercial_id = mi_vendedor_id()
    )
  );

drop policy if exists "ventas_cancelaciones_insert" on ventas_cancelaciones;
create policy "ventas_cancelaciones_insert" on ventas_cancelaciones
  for insert to authenticated
  with check (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = venta_id and vc.dueno_comercial_id = mi_vendedor_id()
    )
  );

drop policy if exists "ventas_cancelaciones_delete" on ventas_cancelaciones;
create policy "ventas_cancelaciones_delete" on ventas_cancelaciones
  for delete to authenticated
  using (es_admin());
