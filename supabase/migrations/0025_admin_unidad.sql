-- ============================================================================
-- CRM Rhinoboots — "Administrador de unidad": un tercer rol que ve y opera
-- el CRM igual que un administrador (dashboard, metas, clientes, ventas,
-- vendedores), pero limitado a UNA sola unidad de negocio (Planta, Tienda
-- Purepero o Guadalajara), nunca a las otras.
--
-- Diseño: en vez de reescribir cada política desde cero, se agrega una
-- función `vendedores_de_mi_unidad()` que devuelve los ids de vendedores de
-- la misma unidad que quien consulta — pero SOLO si quien consulta tiene
-- rol 'admin_unidad'; para cualquier otro rol devuelve un conjunto vacío,
-- así el "OR" que se agrega a cada política no le da más acceso a nadie
-- más (admin sigue viendo todo por es_admin(); un vendedor normal sigue
-- viendo solo lo suyo por mi_vendedor_id()).
-- ============================================================================

-- Agrupa el texto libre de unidad_negocio en una de las 3 unidades reales.
-- Debe reflejar la misma lógica que src/lib/unidades.ts (unidadDe).
create or replace function unidad_de(p_texto text)
returns text as $$
  select case
    when p_texto is null then null
    when lower(p_texto) like '%purepero%' or lower(p_texto) like '%tienda%' then 'Tienda Purepero'
    when lower(p_texto) like '%guadalajara%' then 'Guadalajara'
    when lower(p_texto) like '%planta%' then 'Planta'
    else null
  end;
$$ language sql immutable;

alter table vendedores drop constraint if exists vendedores_rol_check;
alter table vendedores add constraint vendedores_rol_check
  check (rol in ('admin', 'vendedor', 'admin_unidad'));

create or replace function es_admin_unidad()
returns boolean as $$
  select exists (
    select 1 from vendedores where auth_user_id = auth.uid() and rol = 'admin_unidad'
  );
$$ language sql stable security definer set search_path = public;

create or replace function mi_unidad()
returns text as $$
  select unidad_de(unidad_negocio) from vendedores where auth_user_id = auth.uid() limit 1;
$$ language sql stable security definer set search_path = public;

create or replace function vendedores_de_mi_unidad()
returns setof uuid as $$
  select v2.id
  from vendedores yo
  join vendedores v2 on unidad_de(v2.unidad_negocio) = unidad_de(yo.unidad_negocio)
  where yo.auth_user_id = auth.uid()
    and yo.rol = 'admin_unidad'
    and unidad_de(yo.unidad_negocio) is not null;
$$ language sql stable security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- CLIENTES
-- ----------------------------------------------------------------------------
drop policy if exists "clientes_select" on clientes;
create policy "clientes_select" on clientes for select to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "clientes_insert" on clientes;
create policy "clientes_insert" on clientes for insert to authenticated
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "clientes_update" on clientes;
create policy "clientes_update" on clientes for update to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  )
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );
-- clientes_delete se deja solo para es_admin() (borrar sigue siendo cosa
-- de la administración general, no de un administrador de unidad).

-- ----------------------------------------------------------------------------
-- OPORTUNIDADES
-- ----------------------------------------------------------------------------
drop policy if exists "oportunidades_select" on oportunidades;
create policy "oportunidades_select" on oportunidades for select to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "oportunidades_insert" on oportunidades;
create policy "oportunidades_insert" on oportunidades for insert to authenticated
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "oportunidades_update" on oportunidades;
create policy "oportunidades_update" on oportunidades for update to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  )
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );
-- oportunidades_delete se deja solo para es_admin().

-- ----------------------------------------------------------------------------
-- HISTORIAL Y RENGLONES DEL PEDIDO (dependen de la oportunidad)
-- ----------------------------------------------------------------------------
drop policy if exists "historial_select" on oportunidad_historial;
create policy "historial_select" on oportunidad_historial for select to authenticated
  using (
    exists (
      select 1 from oportunidades o
      where o.id = oportunidad_historial.oportunidad_id
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "historial_insert" on oportunidad_historial;
create policy "historial_insert" on oportunidad_historial for insert to authenticated
  with check (
    exists (
      select 1 from oportunidades o
      where o.id = oportunidad_historial.oportunidad_id
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "oportunidad_partidas_todo" on oportunidad_partidas;
create policy "oportunidad_partidas_todo" on oportunidad_partidas for all to authenticated
  using (
    es_admin() or exists (
      select 1 from oportunidades o
      where o.id = oportunidad_partidas.oportunidad_id
        and (
          o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  )
  with check (
    es_admin() or exists (
      select 1 from oportunidades o
      where o.id = oportunidad_partidas.oportunidad_id
        and (
          o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

-- ----------------------------------------------------------------------------
-- TAREAS (seguimientos)
-- ----------------------------------------------------------------------------
drop policy if exists "tareas_select" on tareas;
create policy "tareas_select" on tareas for select to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "tareas_insert" on tareas;
create policy "tareas_insert" on tareas for insert to authenticated
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
    or dueno_comercial_id is null
  );

drop policy if exists "tareas_update" on tareas;
create policy "tareas_update" on tareas for update to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  )
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );
-- tareas_delete se deja solo para es_admin().

-- ----------------------------------------------------------------------------
-- VISITAS
-- ----------------------------------------------------------------------------
drop policy if exists "visitas_select" on visitas;
create policy "visitas_select" on visitas for select to authenticated
  using (
    es_admin() or vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id()
    or vendedor_id in (select vendedores_de_mi_unidad())
    or realizada_para_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "visitas_insert" on visitas;
create policy "visitas_insert" on visitas for insert to authenticated
  with check (
    es_admin() or vendedor_id = mi_vendedor_id()
    or vendedor_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "visitas_update" on visitas;
create policy "visitas_update" on visitas for update to authenticated
  using (
    es_admin() or vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id()
    or vendedor_id in (select vendedores_de_mi_unidad())
    or realizada_para_id in (select vendedores_de_mi_unidad())
  )
  with check (
    es_admin() or vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id()
    or vendedor_id in (select vendedores_de_mi_unidad())
    or realizada_para_id in (select vendedores_de_mi_unidad())
  );
-- visitas_delete se deja solo para es_admin().

-- ----------------------------------------------------------------------------
-- VENTAS (ledger cerrado)
-- ----------------------------------------------------------------------------
drop policy if exists "ventas_cerradas_select" on ventas_cerradas;
create policy "ventas_cerradas_select" on ventas_cerradas for select to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "ventas_cerradas_insert" on ventas_cerradas;
create policy "ventas_cerradas_insert" on ventas_cerradas for insert to authenticated
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "ventas_cerradas_update" on ventas_cerradas;
create policy "ventas_cerradas_update" on ventas_cerradas for update to authenticated
  using (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  )
  with check (
    es_admin() or dueno_comercial_id = mi_vendedor_id()
    or dueno_comercial_id in (select vendedores_de_mi_unidad())
  );

drop policy if exists "ventas_lineas_todo" on ventas_lineas;
create policy "ventas_lineas_todo" on ventas_lineas for all to authenticated
  using (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = ventas_lineas.venta_id
        and (
          vc.dueno_comercial_id = mi_vendedor_id()
          or vc.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  )
  with check (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = ventas_lineas.venta_id
        and (
          vc.dueno_comercial_id = mi_vendedor_id()
          or vc.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "ventas_cancelaciones_select" on ventas_cancelaciones;
create policy "ventas_cancelaciones_select" on ventas_cancelaciones for select to authenticated
  using (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = ventas_cancelaciones.venta_id
        and (
          vc.dueno_comercial_id = mi_vendedor_id()
          or vc.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "ventas_cancelaciones_insert" on ventas_cancelaciones;
create policy "ventas_cancelaciones_insert" on ventas_cancelaciones for insert to authenticated
  with check (
    es_admin() or exists (
      select 1 from ventas_cerradas vc
      where vc.id = ventas_cancelaciones.venta_id
        and (
          vc.dueno_comercial_id = mi_vendedor_id()
          or vc.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );
-- ventas_cancelaciones_delete se deja solo para es_admin().

-- ----------------------------------------------------------------------------
-- METAS (solo lectura para admin de unidad; crear/editar sigue siendo solo
-- de la administración general — esa pantalla no se ofrece a admin_unidad).
-- ----------------------------------------------------------------------------
drop policy if exists "metas_select_unidad" on metas_mensuales;
create policy "metas_select_unidad" on metas_mensuales for select to authenticated
  using (
    es_admin_unidad() and (
      (tipo = 'unidad' and unidad_de(unidad_negocio) = mi_unidad())
      or (tipo = 'vendedor' and vendedor_id in (select vendedores_de_mi_unidad()))
    )
  );

-- ----------------------------------------------------------------------------
-- VENDEDORES: un admin de unidad puede editar (no crear/borrar/cambiar rol
-- ni unidad) a los vendedores de su propia unidad.
-- ----------------------------------------------------------------------------
drop policy if exists "vendedores_update" on vendedores;
create policy "vendedores_update" on vendedores for update to authenticated
  using (
    es_admin() or auth_user_id = auth.uid()
    or id in (select vendedores_de_mi_unidad())
  )
  with check (
    es_admin() or auth_user_id = auth.uid()
    or id in (select vendedores_de_mi_unidad())
  );

-- Nadie que no sea administrador general puede cambiar el rol o la unidad
-- de negocio de un vendedor (evita que un admin de unidad se "mude" a otra
-- sucursal o se autopromueva).
create or replace function trg_bloquear_cambio_rol_o_unidad()
returns trigger as $$
begin
  if not es_admin() and (
    new.rol is distinct from old.rol or new.unidad_negocio is distinct from old.unidad_negocio
  ) then
    raise exception 'Solo un administrador general puede cambiar el rol o la unidad de negocio de un vendedor.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists vendedores_bloquear_cambio_rol on vendedores;
create trigger vendedores_bloquear_cambio_rol
  before update on vendedores
  for each row execute function trg_bloquear_cambio_rol_o_unidad();

-- ----------------------------------------------------------------------------
-- BÚSQUEDA GLOBAL: para un administrador de unidad, se limita a su unidad
-- (para admin y para un vendedor normal se queda igual que hoy: el
-- vendedor normal la usa solo para el aviso "ya existe, es de fulano",
-- cruzando toda la empresa a propósito).
-- ----------------------------------------------------------------------------
create or replace function buscar_clientes_global(p_texto text)
returns table (
  id uuid,
  empresa text,
  ciudad text,
  estado text,
  rfc text,
  tipo_cliente text,
  nivel_cuenta text,
  dueno_comercial_id uuid,
  dueno_nombre text
) as $$
  select c.id, c.empresa, c.ciudad, c.estado, c.rfc, c.tipo_cliente, c.nivel_cuenta,
         c.dueno_comercial_id, v.nombre as dueno_nombre
  from clientes c
  left join vendedores v on v.id = c.dueno_comercial_id
  where p_texto is not null and length(trim(p_texto)) > 0
    and (
      c.empresa ilike '%' || p_texto || '%'
      or c.rfc ilike '%' || p_texto || '%'
    )
    and (
      not es_admin_unidad()
      or c.dueno_comercial_id in (select vendedores_de_mi_unidad())
    )
  order by c.empresa
  limit 50;
$$ language sql stable security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- ARCHIVOS ADJUNTOS (Storage): cotización/factura de la oportunidad, y
-- evidencia de visitas.
-- ----------------------------------------------------------------------------
drop policy if exists "documentos_oportunidad_insert" on storage.objects;
create policy "documentos_oportunidad_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos_oportunidad' and
    exists (
      select 1 from oportunidades o
      where o.id::text = (storage.foldername(name))[1]
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "documentos_oportunidad_select" on storage.objects;
create policy "documentos_oportunidad_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos_oportunidad' and
    exists (
      select 1 from oportunidades o
      where o.id::text = (storage.foldername(name))[1]
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "documentos_oportunidad_delete" on storage.objects;
create policy "documentos_oportunidad_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documentos_oportunidad' and
    exists (
      select 1 from oportunidades o
      where o.id::text = (storage.foldername(name))[1]
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "evidencias_insert" on storage.objects;
create policy "evidencias_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias' and
    exists (
      select 1 from visitas v
      where v.id::text = (storage.foldername(name))[1]
        and (
          es_admin() or v.vendedor_id = mi_vendedor_id() or v.realizada_para_id = mi_vendedor_id()
          or v.vendedor_id in (select vendedores_de_mi_unidad())
          or v.realizada_para_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "evidencias_select" on storage.objects;
create policy "evidencias_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias' and
    exists (
      select 1 from visitas v
      where v.id::text = (storage.foldername(name))[1]
        and (
          es_admin() or v.vendedor_id = mi_vendedor_id() or v.realizada_para_id = mi_vendedor_id()
          or v.vendedor_id in (select vendedores_de_mi_unidad())
          or v.realizada_para_id in (select vendedores_de_mi_unidad())
        )
    )
  );

drop policy if exists "evidencias_delete" on storage.objects;
create policy "evidencias_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidencias' and
    exists (
      select 1 from visitas v
      where v.id::text = (storage.foldername(name))[1]
        and (
          es_admin() or v.vendedor_id = mi_vendedor_id()
          or v.vendedor_id in (select vendedores_de_mi_unidad())
        )
    )
  );
