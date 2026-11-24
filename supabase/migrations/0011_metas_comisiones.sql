-- ============================================================================
-- CRM Rhinoboots — Metas y Comisiones (rediseño de metas_mensuales + tarifas)
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- metas_mensuales pasa de "una meta por vendedor por mes" a poder tener:
--   - varios "contextos" de meta para la misma persona el mismo mes
--     (ej. "Nayeli — B2B" y "Nayeli — Tienda")
--   - metas de UNIDAD DE NEGOCIO completa (ej. Guadalajara), no repartidas
--     por persona
-- ----------------------------------------------------------------------------
alter table metas_mensuales
  drop constraint if exists metas_mensuales_vendedor_id_anio_mes_key;

alter table metas_mensuales
  alter column vendedor_id drop not null;

alter table metas_mensuales
  add column if not exists tipo text not null default 'vendedor'
    check (tipo in ('vendedor', 'unidad'));

alter table metas_mensuales
  add column if not exists unidad_negocio text;

alter table metas_mensuales
  add column if not exists etiqueta text;

alter table metas_mensuales
  rename column meta_pares to meta_total_pares;

alter table metas_mensuales
  add column if not exists piso_piel_pares numeric not null default 0;

alter table metas_mensuales
  drop constraint if exists metas_mensuales_tipo_check;
alter table metas_mensuales
  add constraint metas_mensuales_tipo_check check (
    (tipo = 'vendedor' and vendedor_id is not null and unidad_negocio is null) or
    (tipo = 'unidad' and unidad_negocio is not null and vendedor_id is null)
  );

-- ----------------------------------------------------------------------------
-- Tarifas por línea de producto y reglas de acelerador, guardadas por mes.
-- Un mes ya cerrado sigue calculando con las tarifas/reglas vigentes en ese
-- momento, aunque después cambien para meses futuros.
-- ----------------------------------------------------------------------------
create table if not exists tarifas_mensuales (
  id uuid primary key default gen_random_uuid(),
  anio_mes text not null,
  linea text not null check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico')),
  tarifa_por_par numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anio_mes, linea)
);

drop trigger if exists tarifas_mensuales_set_updated_at on tarifas_mensuales;
create trigger tarifas_mensuales_set_updated_at
  before update on tarifas_mensuales
  for each row execute function set_updated_at();

create table if not exists reglas_acelerador (
  id uuid primary key default gen_random_uuid(),
  anio_mes text not null,
  umbral_pct numeric not null,
  multiplicador numeric not null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

alter table tarifas_mensuales enable row level security;
alter table reglas_acelerador enable row level security;

drop policy if exists "tarifas_mensuales_admin" on tarifas_mensuales;
create policy "tarifas_mensuales_admin" on tarifas_mensuales
  for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "reglas_acelerador_admin" on reglas_acelerador;
create policy "reglas_acelerador_admin" on reglas_acelerador
  for all to authenticated using (es_admin()) with check (es_admin());
