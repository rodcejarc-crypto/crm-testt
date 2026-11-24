-- ============================================================================
-- CRM Rhinoboots — comentarios de gerencia en oportunidades y seguimientos.
--
-- Cualquiera que pueda ver la oportunidad puede comentar (gerencia, admin de
-- unidad, o el dueño para responder). Los comentarios NO se editan; solo el
-- autor puede borrar el suyo durante los primeros 5 minutos. El dueño de la
-- oportunidad ve cuáles son nuevos (leido_por_dueno) y se marcan como leídos
-- al abrir la oportunidad.
-- ============================================================================
create table if not exists comentarios (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades(id) on delete cascade,
  seguimiento_id uuid references tareas(id) on delete cascade,
  autor_id uuid references vendedores(id) on delete set null,
  texto text not null check (length(trim(texto)) > 0),
  creado_en timestamptz not null default now(),
  leido_por_dueno boolean not null default false
);

create index if not exists comentarios_oportunidad_idx on comentarios (oportunidad_id, creado_en);
create index if not exists comentarios_seguimiento_idx on comentarios (seguimiento_id);

alter table comentarios enable row level security;

-- Ver: mismas reglas que las oportunidades (admin ve todas; admin de unidad,
-- las de su unidad; el vendedor, las suyas).
drop policy if exists "comentarios_select" on comentarios;
create policy "comentarios_select" on comentarios for select to authenticated
  using (
    exists (
      select 1 from oportunidades o
      where o.id = comentarios.oportunidad_id
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

-- Comentar: sobre una oportunidad que puedas ver, y siempre como tú mismo.
drop policy if exists "comentarios_insert" on comentarios;
create policy "comentarios_insert" on comentarios for insert to authenticated
  with check (
    autor_id = mi_vendedor_id()
    and exists (
      select 1 from oportunidades o
      where o.id = comentarios.oportunidad_id
        and (
          es_admin() or o.dueno_comercial_id = mi_vendedor_id()
          or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
        )
    )
  );

-- Borrar: solo el autor y solo en los primeros 5 minutos.
drop policy if exists "comentarios_delete" on comentarios;
create policy "comentarios_delete" on comentarios for delete to authenticated
  using (autor_id = mi_vendedor_id() and creado_en > now() - interval '5 minutes');

-- No hay política de UPDATE: nadie puede editar un comentario.

-- Antes de guardar: el seguimiento debe ser de la misma oportunidad, y
-- "leído por el dueño" solo nace en verdadero si el autor es el propio dueño
-- (nadie puede inventar ese valor desde fuera).
create or replace function trg_comentarios_antes_insertar()
returns trigger as $$
declare
  v_dueno uuid;
begin
  if new.seguimiento_id is not null and not exists (
    select 1 from tareas t
    where t.id = new.seguimiento_id and t.oportunidad_id = new.oportunidad_id
  ) then
    raise exception 'Ese seguimiento no pertenece a esta oportunidad.';
  end if;

  select dueno_comercial_id into v_dueno from oportunidades where id = new.oportunidad_id;
  new.leido_por_dueno := (v_dueno is not null and new.autor_id = v_dueno);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists comentarios_antes_insertar on comentarios;
create trigger comentarios_antes_insertar
  before insert on comentarios
  for each row execute function trg_comentarios_antes_insertar();

-- Comentarios nuevos para el vendedor que inició sesión (de oportunidades
-- que son SUYAS, escritos por otra persona y todavía no leídos).
create or replace function mis_comentarios_sin_leer()
returns table (oportunidad_id uuid, seguimiento_id uuid) as $$
  select c.oportunidad_id, c.seguimiento_id
  from comentarios c
  join oportunidades o on o.id = c.oportunidad_id
  where o.dueno_comercial_id = mi_vendedor_id()
    and not c.leido_por_dueno
    and c.autor_id is distinct from mi_vendedor_id();
$$ language sql stable security definer set search_path = public;

-- Al abrir la oportunidad, el dueño marca como leídos sus comentarios.
create or replace function marcar_comentarios_leidos(p_oportunidad uuid)
returns void as $$
  update comentarios c
     set leido_por_dueno = true
    from oportunidades o
   where o.id = c.oportunidad_id
     and c.oportunidad_id = p_oportunidad
     and o.dueno_comercial_id = mi_vendedor_id()
     and not c.leido_por_dueno;
$$ language sql volatile security definer set search_path = public;

revoke all on function mis_comentarios_sin_leer() from public;
grant execute on function mis_comentarios_sin_leer() to authenticated;
revoke all on function marcar_comentarios_leidos(uuid) from public;
grant execute on function marcar_comentarios_leidos(uuid) to authenticated;
