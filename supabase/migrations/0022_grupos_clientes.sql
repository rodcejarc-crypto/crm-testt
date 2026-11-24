-- ============================================================================
-- CRM Rhinoboots — grupos de clientes: varias razones sociales que en realidad
-- pertenecen a un mismo grupo o empresa grande. Un cliente puede pertenecer a
-- un grupo (clientes.grupo_id). Los nombres de grupo los ven todos (para no
-- duplicarlos), pero cada vendedor solo ve las fichas de SUS clientes; de los
-- demás miembros solo se sabe cuántos son (resumen_grupo).
-- ============================================================================

create table if not exists grupos_clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  creado_por uuid references vendedores(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists grupos_clientes_nombre_uq on grupos_clientes (lower(trim(nombre)));

alter table clientes add column if not exists grupo_id uuid references grupos_clientes(id) on delete set null;
create index if not exists clientes_grupo_idx on clientes (grupo_id);

alter table grupos_clientes enable row level security;

drop policy if exists "grupos_select" on grupos_clientes;
create policy "grupos_select" on grupos_clientes for select to authenticated using (true);

drop policy if exists "grupos_insert" on grupos_clientes;
create policy "grupos_insert" on grupos_clientes for insert to authenticated with check (true);

drop policy if exists "grupos_update" on grupos_clientes;
create policy "grupos_update" on grupos_clientes for update to authenticated
  using (es_admin() or creado_por = mi_vendedor_id())
  with check (es_admin() or creado_por = mi_vendedor_id());

drop policy if exists "grupos_delete" on grupos_clientes;
create policy "grupos_delete" on grupos_clientes for delete to authenticated using (es_admin());

-- Cuántas razones sociales tiene el grupo en total (sin revelar quiénes son).
create or replace function resumen_grupo(p_grupo uuid)
returns int as $$
  select count(*)::int from clientes where grupo_id = p_grupo;
$$ language sql stable security definer set search_path = public;

revoke all on function resumen_grupo(uuid) from public;
grant execute on function resumen_grupo(uuid) to authenticated;
