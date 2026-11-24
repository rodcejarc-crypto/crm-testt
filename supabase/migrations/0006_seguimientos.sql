-- ============================================================================
-- CRM Rhinoboots — seguimientos automáticos (tareas)
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'seguimiento_venta',
    'seguimiento_recuperacion',
    'licitacion_entrega',
    'checkin_cuenta_clave'
  )),
  titulo text not null,
  fecha_vencimiento date not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'completada', 'cancelada')),
  oportunidad_id uuid references oportunidades(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  dueno_comercial_id uuid references vendedores(id),
  completada_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tareas_dueno_idx on tareas (dueno_comercial_id, estado, fecha_vencimiento);
create index if not exists tareas_oportunidad_idx on tareas (oportunidad_id);
create index if not exists tareas_cliente_idx on tareas (cliente_id);

alter table tareas enable row level security;

drop policy if exists "tareas_select" on tareas;
create policy "tareas_select" on tareas
  for select to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id());

drop policy if exists "tareas_insert" on tareas;
create policy "tareas_insert" on tareas
  for insert to authenticated
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id() or dueno_comercial_id is null);

drop policy if exists "tareas_update" on tareas;
create policy "tareas_update" on tareas
  for update to authenticated
  using (es_admin() or dueno_comercial_id = mi_vendedor_id())
  with check (es_admin() or dueno_comercial_id = mi_vendedor_id());

drop policy if exists "tareas_delete" on tareas;
create policy "tareas_delete" on tareas
  for delete to authenticated
  using (es_admin());

-- ----------------------------------------------------------------------------
-- 1) Ventas: al entrar a "Cotización enviada", crea el protocolo de
--    seguimiento de días 2/5/10/15/20/30.
-- 2) Recuperación: mismo protocolo al entrar a "Contacto de reactivación".
-- ----------------------------------------------------------------------------
create or replace function crear_protocolo_seguimiento(
  p_oportunidad_id uuid,
  p_dueno uuid,
  p_tipo text
) returns void as $$
begin
  insert into tareas (tipo, titulo, fecha_vencimiento, oportunidad_id, dueno_comercial_id)
  values
    (p_tipo, 'Día 2 — Confirmación de recepción', current_date + 2, p_oportunidad_id, p_dueno),
    (p_tipo, 'Día 5 — Seguimiento 1', current_date + 5, p_oportunidad_id, p_dueno),
    (p_tipo, 'Día 10 — Seguimiento 2', current_date + 10, p_oportunidad_id, p_dueno),
    (p_tipo, 'Día 15 — Seguimiento 3', current_date + 15, p_oportunidad_id, p_dueno),
    (p_tipo, 'Día 20 — Seguimiento 4', current_date + 20, p_oportunidad_id, p_dueno),
    (p_tipo, 'Día 30 — Cierre o reprogramación', current_date + 30, p_oportunidad_id, p_dueno);
end;
$$ language plpgsql;

create or replace function trg_seguimientos_oportunidad()
returns trigger as $$
begin
  -- Ventas → "Cotización enviada"
  if new.pipeline = 'ventas' and new.etapa = 'Cotización enviada'
     and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
    if not exists (
      select 1 from tareas
      where oportunidad_id = new.id and tipo = 'seguimiento_venta'
    ) then
      perform crear_protocolo_seguimiento(new.id, new.dueno_comercial_id, 'seguimiento_venta');
    end if;
  end if;

  -- Recuperación → "Contacto de reactivación"
  if new.pipeline = 'recuperacion' and new.etapa = 'Contacto de reactivación'
     and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
    if not exists (
      select 1 from tareas
      where oportunidad_id = new.id and tipo = 'seguimiento_recuperacion'
    ) then
      perform crear_protocolo_seguimiento(new.id, new.dueno_comercial_id, 'seguimiento_recuperacion');
    end if;
  end if;

  -- Licitaciones: recordatorios 5 y 1 día antes de la fecha límite de entrega.
  -- Se recalculan si la fecha límite cambia.
  if new.pipeline = 'licitaciones' and new.estado_cierre = 'abierta'
     and new.fecha_limite_entrega is not null
     and (tg_op = 'INSERT' or old.fecha_limite_entrega is distinct from new.fecha_limite_entrega) then
    delete from tareas
      where oportunidad_id = new.id and tipo = 'licitacion_entrega' and estado = 'pendiente';
    insert into tareas (tipo, titulo, fecha_vencimiento, oportunidad_id, dueno_comercial_id)
    values
      ('licitacion_entrega', '5 días antes de la entrega', new.fecha_limite_entrega - 5, new.id, new.dueno_comercial_id),
      ('licitacion_entrega', '1 día antes de la entrega', new.fecha_limite_entrega - 1, new.id, new.dueno_comercial_id);
  end if;

  -- Al cerrar (ganada o perdida), cancela los seguimientos pendientes.
  if tg_op = 'UPDATE' and old.estado_cierre = 'abierta' and new.estado_cierre <> 'abierta' then
    update tareas set estado = 'cancelada'
      where oportunidad_id = new.id and estado = 'pendiente';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists oportunidades_seguimientos on oportunidades;
create trigger oportunidades_seguimientos
  after insert or update on oportunidades
  for each row execute function trg_seguimientos_oportunidad();

-- ----------------------------------------------------------------------------
-- 3) Cuentas clave: check-in cada 30 días para clientes "Estratégica",
--    sin depender de que haya una oportunidad abierta.
-- ----------------------------------------------------------------------------
create or replace function trg_checkin_cuenta_clave()
returns trigger as $$
begin
  if new.nivel_cuenta = 'Estratégica'
     and (tg_op = 'INSERT' or old.nivel_cuenta is distinct from new.nivel_cuenta) then
    if not exists (
      select 1 from tareas
      where cliente_id = new.id and tipo = 'checkin_cuenta_clave' and estado = 'pendiente'
    ) then
      insert into tareas (tipo, titulo, fecha_vencimiento, cliente_id, dueno_comercial_id)
      values ('checkin_cuenta_clave', 'Check-in de cuenta clave', current_date + 30, new.id, new.dueno_comercial_id);
    end if;
  end if;

  -- Si deja de ser cuenta clave, cancela el check-in pendiente.
  if tg_op = 'UPDATE' and old.nivel_cuenta = 'Estratégica' and new.nivel_cuenta <> 'Estratégica' then
    update tareas set estado = 'cancelada'
      where cliente_id = new.id and tipo = 'checkin_cuenta_clave' and estado = 'pendiente';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists clientes_checkin on clientes;
create trigger clientes_checkin
  after insert or update on clientes
  for each row execute function trg_checkin_cuenta_clave();

-- Al completar un check-in, programa automáticamente el siguiente (+30 días).
create or replace function trg_renovar_checkin()
returns trigger as $$
declare
  v_nivel text;
begin
  if new.tipo = 'checkin_cuenta_clave' and new.estado = 'completada'
     and old.estado is distinct from 'completada' then
    select nivel_cuenta into v_nivel from clientes where id = new.cliente_id;
    if v_nivel = 'Estratégica' then
      insert into tareas (tipo, titulo, fecha_vencimiento, cliente_id, dueno_comercial_id)
      values ('checkin_cuenta_clave', 'Check-in de cuenta clave', current_date + 30, new.cliente_id, new.dueno_comercial_id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tareas_renovar_checkin on tareas;
create trigger tareas_renovar_checkin
  after update on tareas
  for each row execute function trg_renovar_checkin();

-- Crea el primer check-in para las cuentas clave que ya existían antes de
-- esta migración.
insert into tareas (tipo, titulo, fecha_vencimiento, cliente_id, dueno_comercial_id)
select 'checkin_cuenta_clave', 'Check-in de cuenta clave', current_date + 30, c.id, c.dueno_comercial_id
from clientes c
where c.nivel_cuenta = 'Estratégica'
  and not exists (
    select 1 from tareas t
    where t.cliente_id = c.id and t.tipo = 'checkin_cuenta_clave' and t.estado = 'pendiente'
  );
