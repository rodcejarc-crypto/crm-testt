-- ============================================================================
-- CRM Rhinoboots — inicio de sesión por vendedor
-- Pégalo en el SQL Editor de Supabase y dale "Run", igual que la vez pasada.
-- ============================================================================

-- Vincula cada vendedor con su cuenta de acceso (tabla auth.users, la crea
-- automáticamente Supabase cuando alguien inicia sesión).
alter table vendedores
  add column if not exists auth_user_id uuid references auth.users(id) unique;

-- A partir de ahora, solo alguien con sesión iniciada puede leer o escribir
-- datos del CRM (antes cualquiera con la URL pública podía hacerlo).
alter table clientes enable row level security;
alter table oportunidades enable row level security;
alter table oportunidad_historial enable row level security;
alter table vendedores enable row level security;

-- Cualquier usuario que inició sesión puede ver y editar todo (es un CRM de
-- equipo, no hay datos "privados" por vendedor). Si más adelante quieres
-- restringir por dueño, se ajustan estas políticas.
drop policy if exists "autenticados_todo_clientes" on clientes;
create policy "autenticados_todo_clientes" on clientes
  for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_todo_oportunidades" on oportunidades;
create policy "autenticados_todo_oportunidades" on oportunidades
  for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_todo_historial" on oportunidad_historial;
create policy "autenticados_todo_historial" on oportunidad_historial
  for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_todo_vendedores" on vendedores;
create policy "autenticados_todo_vendedores" on vendedores
  for all to authenticated using (true) with check (true);
