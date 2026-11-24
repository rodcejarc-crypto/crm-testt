-- ============================================================================
-- CRM Rhinoboots — el protocolo de seguimiento arranca al CREAR la
-- oportunidad (cualquier pipeline, cualquier etapa), no hasta que el
-- vendedor la mueva a una etapa específica.
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

-- Nuevo tipo de tarea para el protocolo genérico de Licitaciones (antes solo
-- tenían los recordatorios de fecha límite, "licitacion_entrega"). Busca el
-- nombre real de la restricción existente en vez de suponerlo, por si no se
-- llama "tareas_tipo_check".
do $$
declare
  v_nombre text;
begin
  select con.conname into v_nombre
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'tareas' and con.contype = 'c' and att.attname = 'tipo'
  limit 1;

  if v_nombre is not null then
    execute format('alter table tareas drop constraint %I', v_nombre);
  end if;

  alter table tareas add constraint tareas_tipo_check check (tipo in (
    'seguimiento_venta',
    'seguimiento_recuperacion',
    'seguimiento_licitacion',
    'licitacion_entrega',
    'checkin_cuenta_clave'
  ));
end $$;

create or replace function trg_seguimientos_oportunidad()
returns trigger as $$
declare
  v_tipo text;
begin
  -- Al CREARSE cualquier oportunidad abierta (Ventas, Licitaciones o
  -- Recuperación, en cualquier etapa inicial) arranca el protocolo de
  -- seguimiento día 2/5/10/15/20/30 — ya no espera a una etapa puntual.
  if tg_op = 'INSERT' and new.estado_cierre = 'abierta' then
    v_tipo := case new.pipeline
      when 'ventas' then 'seguimiento_venta'
      when 'recuperacion' then 'seguimiento_recuperacion'
      when 'licitaciones' then 'seguimiento_licitacion'
    end;
    if v_tipo is not null and not exists (
      select 1 from tareas
      where oportunidad_id = new.id
        and tipo in ('seguimiento_venta', 'seguimiento_recuperacion', 'seguimiento_licitacion')
    ) then
      perform crear_protocolo_seguimiento(new.id, new.dueno_comercial_id, v_tipo);
    end if;
  end if;

  -- Licitaciones: además del protocolo genérico de arriba, recordatorios
  -- puntuales 5 y 1 día antes de la fecha límite de entrega (se
  -- recalculan si la fecha límite cambia).
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

-- ----------------------------------------------------------------------------
-- Relleno retroactivo: a las oportunidades abiertas que ya existían y todavía
-- no tienen su protocolo (por ejemplo, las 480 de Recuperación de Cartera
-- que se cargaron con la base de clientes), se lo arranca ahora — contando
-- los días 2/5/10/... desde HOY, no desde su fecha de creación real, para
-- no aventarle al equipo un montón de tareas ya atrasadas de un jalón.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  v_tipo text;
begin
  for r in
    select o.id, o.dueno_comercial_id, o.pipeline
    from oportunidades o
    where o.estado_cierre = 'abierta'
      and not exists (
        select 1 from tareas t
        where t.oportunidad_id = o.id
          and t.tipo in ('seguimiento_venta', 'seguimiento_recuperacion', 'seguimiento_licitacion')
      )
  loop
    v_tipo := case r.pipeline
      when 'ventas' then 'seguimiento_venta'
      when 'recuperacion' then 'seguimiento_recuperacion'
      when 'licitaciones' then 'seguimiento_licitacion'
    end;
    if v_tipo is not null then
      perform crear_protocolo_seguimiento(r.id, r.dueno_comercial_id, v_tipo);
    end if;
  end loop;
end $$;
