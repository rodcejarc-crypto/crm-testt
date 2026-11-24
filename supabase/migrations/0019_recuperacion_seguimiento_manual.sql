-- ============================================================================
-- CRM Rhinoboots — corrige 0018: Recuperación de Cartera NO debe arrancar su
-- seguimiento al crearse (o al cargar un lote de cuentas), solo cuando el
-- vendedor de verdad avanza la tarjeta a "Contacto de reactivación".
-- Ventas y Licitaciones SÍ siguen arrancando desde que se crea la
-- oportunidad (eso no cambia).
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

create or replace function trg_seguimientos_oportunidad()
returns trigger as $$
declare
  v_tipo text;
begin
  -- Al CREARSE una oportunidad abierta de VENTAS o LICITACIONES (cualquier
  -- etapa inicial), arranca el protocolo de seguimiento día 2/5/10/15/20/30.
  -- Recuperación de Cartera NO entra aquí — ver el bloque de abajo.
  if tg_op = 'INSERT' and new.estado_cierre = 'abierta' and new.pipeline in ('ventas', 'licitaciones') then
    v_tipo := case new.pipeline
      when 'ventas' then 'seguimiento_venta'
      when 'licitaciones' then 'seguimiento_licitacion'
    end;
    if not exists (
      select 1 from tareas
      where oportunidad_id = new.id
        and tipo in ('seguimiento_venta', 'seguimiento_recuperacion', 'seguimiento_licitacion')
    ) then
      perform crear_protocolo_seguimiento(new.id, new.dueno_comercial_id, v_tipo);
    end if;
  end if;

  -- Recuperación de Cartera: el protocolo solo arranca cuando el vendedor
  -- de verdad avanza la tarjeta a "Contacto de reactivación" (no al
  -- crearse ni al cargar un lote de cuentas identificadas para recuperar).
  if new.pipeline = 'recuperacion' and new.etapa = 'Contacto de reactivación'
     and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
    if not exists (
      select 1 from tareas
      where oportunidad_id = new.id and tipo = 'seguimiento_recuperacion'
    ) then
      perform crear_protocolo_seguimiento(new.id, new.dueno_comercial_id, 'seguimiento_recuperacion');
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
-- Deshace el relleno retroactivo de 0018: borra las tareas de seguimiento de
-- Recuperación que se le programaron de más a cuentas que nadie ha avanzado
-- todavía (siguen en "Cuenta perdida identificada").
-- ----------------------------------------------------------------------------
delete from tareas t
using oportunidades o
where t.oportunidad_id = o.id
  and t.tipo = 'seguimiento_recuperacion'
  and t.estado = 'pendiente'
  and o.pipeline = 'recuperacion'
  and o.etapa <> 'Contacto de reactivación';
