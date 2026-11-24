-- ============================================================================
-- CRM Rhinoboots — Programa de visitas + evidencia (Supabase Storage)
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  vendedor_id uuid not null references vendedores(id),
  realizada_para_id uuid not null references vendedores(id),
  estado text not null default 'agendada' check (estado in ('agendada', 'realizada')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visitas_fecha_idx on visitas (fecha);
create index if not exists visitas_vendedor_idx on visitas (vendedor_id);
create index if not exists visitas_para_idx on visitas (realizada_para_id);

drop trigger if exists visitas_set_updated_at on visitas;
create trigger visitas_set_updated_at
  before update on visitas
  for each row execute function set_updated_at();

alter table visitas enable row level security;

drop policy if exists "visitas_select" on visitas;
create policy "visitas_select" on visitas
  for select to authenticated
  using (es_admin() or vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id());

drop policy if exists "visitas_insert" on visitas;
create policy "visitas_insert" on visitas
  for insert to authenticated
  with check (es_admin() or vendedor_id = mi_vendedor_id());

drop policy if exists "visitas_update" on visitas;
create policy "visitas_update" on visitas
  for update to authenticated
  using (es_admin() or vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id())
  with check (es_admin() or vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id());

drop policy if exists "visitas_delete" on visitas;
create policy "visitas_delete" on visitas
  for delete to authenticated
  using (es_admin());

-- ----------------------------------------------------------------------------
-- Bucket de Storage para la evidencia (fotos, PDFs, etc.). Los archivos se
-- guardan como "<visita_id>/<nombre-archivo>", y esa carpeta es lo que
-- vincula el archivo con su visita para los permisos de abajo.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

drop policy if exists "evidencias_insert" on storage.objects;
create policy "evidencias_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias' and
    exists (
      select 1 from visitas v
      where v.id::text = (storage.foldername(name))[1]
        and (es_admin() or v.vendedor_id = mi_vendedor_id() or v.realizada_para_id = mi_vendedor_id())
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
        and (es_admin() or v.vendedor_id = mi_vendedor_id() or v.realizada_para_id = mi_vendedor_id())
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
        and (es_admin() or v.vendedor_id = mi_vendedor_id())
    )
  );
