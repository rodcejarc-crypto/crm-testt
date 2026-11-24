-- ============================================================================
-- CRM Rhinoboots — permisos por vendedor
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

-- Cada vendedor tiene un rol: 'admin' ve y edita todo; 'vendedor' solo ve
-- lo que es suyo (clientes y oportunidades donde él/ella es el dueño).
alter table vendedores
  add column if not exists rol text not null default 'vendedor'
    check (rol in ('admin', 'vendedor'));

-- Deja como administrador a la primera cuenta creada (marce.rhino@gmail.com).
update vendedores set rol = 'admin' where email = 'marce.rhino@gmail.com';

-- Funciones auxiliares para las políticas de seguridad.
create or replace function es_admin()
returns boolean as $$
  select exists (
    select 1 from vendedores
    where auth_user_id = auth.uid() and rol = 'admin'
  );
$$ language sql stable security definer set search_path = public;

create or replace function mi_vendedor_id()
returns uuid as $$
  select id from vendedores where auth_user_id = auth.uid() limit 1;
$$ language sql stable security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- CLIENTES: un vendedor solo ve/edita los suyos; un admin ve todos.
-- ----------------------------------------------------------------------------
drop policy if exists "autenticados_todo_clientes" on clientes;

create policy "clientes_select" on clientes
  for select to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id());

create policy "clientes_insert" on clientes
  for insert to authenticated
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

create policy "clientes_update" on clientes
  for update to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id())
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

create policy "clientes_delete" on clientes
  for delete to authenticated
  using (es_admin());

-- ----------------------------------------------------------------------------
-- OPORTUNIDADES: igual, por dueno_comercial_id propio de la oportunidad.
-- ----------------------------------------------------------------------------
drop policy if exists "autenticados_todo_oportunidades" on oportunidades;

create policy "oportunidades_select" on oportunidades
  for select to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id());

create policy "oportunidades_insert" on oportunidades
  for insert to authenticated
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

create policy "oportunidades_update" on oportunidades
  for update to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id())
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

create policy "oportunidades_delete" on oportunidades
  for delete to authenticated
  using (es_admin());

-- ----------------------------------------------------------------------------
-- HISTORIAL: visible/insertable solo si puedes ver la oportunidad dueña.
-- ----------------------------------------------------------------------------
drop policy if exists "autenticados_todo_historial" on oportunidad_historial;

create policy "historial_select" on oportunidad_historial
  for select to authenticated
  using (
    exists (
      select 1 from oportunidades o
      where o.id = oportunidad_historial.oportunidad_id
        and (es_admin() or o.dueno_comercial_id = mi_vendedor_id())
    )
  );

create policy "historial_insert" on oportunidad_historial
  for insert to authenticated
  with check (
    exists (
      select 1 from oportunidades o
      where o.id = oportunidad_historial.oportunidad_id
        and (es_admin() or o.dueno_comercial_id = mi_vendedor_id())
    )
  );

-- ----------------------------------------------------------------------------
-- VENDEDORES: todos pueden ver la lista (nombres, para asignar dueños).
-- Solo un admin puede crear, editar o borrar cuentas de otras personas;
-- cualquiera puede editar su propia fila (por ejemplo, su nombre).
-- ----------------------------------------------------------------------------
drop policy if exists "autenticados_todo_vendedores" on vendedores;

create policy "vendedores_select" on vendedores
  for select to authenticated
  using (true);

create policy "vendedores_insert" on vendedores
  for insert to authenticated
  with check (es_admin());

create policy "vendedores_update" on vendedores
  for update to authenticated
  using (es_admin() or auth_user_id = auth.uid())
  with check (es_admin() or auth_user_id = auth.uid());

create policy "vendedores_delete" on vendedores
  for delete to authenticated
  using (es_admin());
