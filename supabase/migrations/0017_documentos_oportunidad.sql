-- ============================================================================
-- CRM Rhinoboots — adjuntos de oportunidad (cotización / factura)
-- Pégalo en el SQL Editor de Supabase y dale "Run".
--
-- Mismo patrón que "evidencias" (visitas): bucket privado, los archivos se
-- guardan como "<oportunidad_id>/<categoria>/<nombre-archivo>" y esa
-- carpeta vincula el archivo con su oportunidad para los permisos.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('documentos_oportunidad', 'documentos_oportunidad', false)
on conflict (id) do nothing;

drop policy if exists "documentos_oportunidad_insert" on storage.objects;
create policy "documentos_oportunidad_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos_oportunidad' and
    exists (
      select 1 from oportunidades o
      where o.id::text = (storage.foldername(name))[1]
        and (es_admin() or o.dueno_comercial_id = mi_vendedor_id())
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
        and (es_admin() or o.dueno_comercial_id = mi_vendedor_id())
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
        and (es_admin() or o.dueno_comercial_id = mi_vendedor_id())
    )
  );
