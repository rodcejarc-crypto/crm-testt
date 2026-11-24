-- ============================================================================
-- CRM Rhinoboots — dashboard ejecutivo: pares vendidos y metas mensuales
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

-- Pares vendidos, capturado al cerrar una oportunidad de Ventas como Ganada.
alter table oportunidades
  add column if not exists pares_vendidos integer;

-- Meta mensual de pares por vendedor (cambia cada mes; la unidad de negocio
-- se deriva de vendedores.unidad_negocio al sumar por equipo).
create table if not exists metas_mensuales (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  anio_mes text not null check (anio_mes ~ '^\d{4}-\d{2}$'),
  meta_pares numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendedor_id, anio_mes)
);

drop trigger if exists metas_mensuales_set_updated_at on metas_mensuales;
create trigger metas_mensuales_set_updated_at
  before update on metas_mensuales
  for each row execute function set_updated_at();

alter table metas_mensuales enable row level security;

-- Solo administradores capturan y ven las metas (pantalla ejecutiva).
drop policy if exists "metas_admin_todo" on metas_mensuales;
create policy "metas_admin_todo" on metas_mensuales
  for all to authenticated
  using (es_admin())
  with check (es_admin());
