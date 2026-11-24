-- ============================================================================
-- CRM Rhinoboots — Visitas solo para vendedores de campo, ligadas a cliente
-- y oportunidad, con evidencia obligatoria.
-- ============================================================================

-- 1) Quién hace visitas de campo (lo cambia solo la administración general).
alter table vendedores add column if not exists hace_visitas_campo boolean not null default false;

update vendedores set hace_visitas_campo = true
 where nombre in ('Gabino Ordaz Cendejas', 'Andres Lopez Javalois', 'Pedro José Catellon Estrada');

-- El disparador que ya protegía rol y unidad también protege este campo.
create or replace function trg_bloquear_cambio_rol_o_unidad()
returns trigger as $$
begin
  if auth.uid() is not null and not es_admin() and (
    new.rol is distinct from old.rol
    or new.unidad_negocio is distinct from old.unidad_negocio
    or new.hace_visitas_campo is distinct from old.hace_visitas_campo
  ) then
    raise exception 'Solo un administrador general puede cambiar el rol, la unidad de negocio o si hace visitas de campo.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- "Administración" (admin general o de unidad) y los vendedores de campo.
create or replace function puede_visitas_campo()
returns boolean as $$
  select es_admin() or es_admin_unidad() or exists (
    select 1 from vendedores where auth_user_id = auth.uid() and hace_visitas_campo
  );
$$ language sql stable security definer set search_path = public;

-- 2) Visitas ligadas a cliente y oportunidad (opcionales: las viejas quedan vacías).
alter table visitas add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table visitas add column if not exists oportunidad_id uuid references oportunidades(id) on delete set null;
create index if not exists visitas_cliente_idx on visitas (cliente_id);
create index if not exists visitas_oportunidad_idx on visitas (oportunidad_id);

-- Reglas de coherencia: toda visita NUEVA lleva cliente, y la oportunidad
-- (si hay) debe ser de ese cliente. Al marcarla realizada exige evidencia y
-- deja un seguimiento hecho en la oportunidad.
create or replace function trg_visitas_validar()
returns trigger as $$
declare
  v_op oportunidades%rowtype;
begin
  if tg_op = 'INSERT' and new.cliente_id is null then
    raise exception 'Elige el cliente de la visita.';
  end if;

  if new.oportunidad_id is not null then
    select * into v_op from oportunidades where id = new.oportunidad_id;
    if not found then
      raise exception 'No se encontró esa oportunidad.';
    end if;
    if new.cliente_id is null then
      new.cliente_id := v_op.cliente_id;
    elsif new.cliente_id <> v_op.cliente_id then
      raise exception 'La oportunidad no pertenece a ese cliente.';
    end if;
  end if;

  if new.estado = 'realizada' and (tg_op = 'INSERT' or old.estado is distinct from 'realizada') then
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'evidencias' and (storage.foldername(name))[1] = new.id::text
    ) then
      raise exception 'Sube la foto o evidencia antes de marcarla como realizada.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists visitas_validar on visitas;
create trigger visitas_validar
  before insert or update on visitas
  for each row execute function trg_visitas_validar();

create or replace function trg_visitas_registrar_seguimiento()
returns trigger as $$
declare
  v_op oportunidades%rowtype;
begin
  if new.estado = 'realizada' and old.estado is distinct from 'realizada' and new.oportunidad_id is not null then
    select * into v_op from oportunidades where id = new.oportunidad_id;
    if found then
      insert into tareas (tipo, titulo, fecha_vencimiento, estado, completada_at, nota,
                          oportunidad_id, cliente_id, dueno_comercial_id)
      values (
        case v_op.pipeline
          when 'recuperacion' then 'seguimiento_recuperacion'
          when 'licitaciones' then 'seguimiento_licitacion'
          else 'seguimiento_venta'
        end,
        'Visita de campo',
        new.fecha, 'completada', now(),
        'Visita realizada: ' || coalesce(nullif(trim(new.notas), ''), 'sin nota'),
        v_op.id, v_op.cliente_id, v_op.dueno_comercial_id
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists visitas_registrar_seguimiento on visitas;
create trigger visitas_registrar_seguimiento
  after update on visitas
  for each row execute function trg_visitas_registrar_seguimiento();

-- 3) Visibilidad. Solo administración y vendedores de campo usan Visitas;
-- las visitas viejas de otros vendedores siguen existiendo y las ve la
-- administración. Cualquiera que pueda ver una oportunidad ve sus visitas.
drop policy if exists "visitas_select" on visitas;
create policy "visitas_select" on visitas for select to authenticated
  using (
    es_admin()
    or (
      puede_visitas_campo() and (
        vendedor_id = mi_vendedor_id() or realizada_para_id = mi_vendedor_id()
        or vendedor_id in (select vendedores_de_mi_unidad())
        or realizada_para_id in (select vendedores_de_mi_unidad())
      )
    )
  );

drop policy if exists "visitas_select_por_oportunidad" on visitas;
create policy "visitas_select_por_oportunidad" on visitas for select to authenticated
  using (
    oportunidad_id is not null and exists (
      select 1 from oportunidades o where o.id = visitas.oportunidad_id
    )
  );

drop policy if exists "visitas_insert" on visitas;
create policy "visitas_insert" on visitas for insert to authenticated
  with check (
    es_admin()
    or (
      puede_visitas_campo() and (
        vendedor_id = mi_vendedor_id()
        or vendedor_id in (select vendedores_de_mi_unidad())
      )
    )
  );

-- La evidencia (miniaturas) también la ve quien pueda ver la oportunidad ligada.
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
          or (
            v.oportunidad_id is not null
            and exists (select 1 from oportunidades o where o.id = v.oportunidad_id)
          )
        )
    )
  );
