-- ============================================================================
-- CRM Rhinoboots — Ventas directas vs. embudo.
--
-- Un cliente que ya te contactó para hacer un pedido NO es una oportunidad que
-- haya que "trabajar": se registra como venta directa. No genera seguimientos
-- automáticos y no cuenta en las métricas del embudo (sí cuenta para ventas,
-- metas, comisiones y cobranza). El embudo queda para prospección y cotización.
-- ============================================================================

alter table oportunidades add column if not exists origen text not null default 'embudo'
  check (origen in ('embudo', 'venta_directa'));
create index if not exists oportunidades_origen_idx on oportunidades (origen);

-- Lo que ya existe: una venta de Ventas que se cerró en menos de 1 día
-- nunca pasó por el proceso, es una venta directa.
update oportunidades
   set origen = 'venta_directa'
 where pipeline = 'ventas' and estado_cierre = 'ganada'
   and coalesce(fecha_cierre, updated_at) - created_at < interval '1 day';

-- El seguimiento automático (día 2/5/10/15/20/30) solo arranca para oportunidades
-- del embudo. Igual que 0019, más la condición origen = 'embudo'.
create or replace function trg_seguimientos_oportunidad()
returns trigger as $$
declare
  v_tipo text;
begin
  if tg_op = 'INSERT' and new.estado_cierre = 'abierta' and new.origen = 'embudo'
     and new.pipeline in ('ventas', 'licitaciones') then
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

  if new.pipeline = 'recuperacion' and new.etapa = 'Contacto de reactivación'
     and (tg_op = 'INSERT' or old.etapa is distinct from new.etapa) then
    if not exists (
      select 1 from tareas
      where oportunidad_id = new.id and tipo = 'seguimiento_recuperacion'
    ) then
      perform crear_protocolo_seguimiento(new.id, new.dueno_comercial_id, 'seguimiento_recuperacion');
    end if;
  end if;

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

  if tg_op = 'UPDATE' and old.estado_cierre = 'abierta' and new.estado_cierre <> 'abierta' then
    update tareas set estado = 'cancelada'
      where oportunidad_id = new.id and estado = 'pendiente';
  end if;

  return new;
end;
$$ language plpgsql;

-- Convierte una oportunidad abierta de Ventas en venta directa: sale del embudo y
-- se cancelan sus seguimientos pendientes.
create or replace function convertir_a_venta_directa(p_oportunidad uuid)
returns void as $$
declare
  o oportunidades%rowtype;
begin
  select * into o from oportunidades where id = p_oportunidad;
  if not found then
    raise exception 'No se encontró la oportunidad.';
  end if;
  if not puede_ver_oportunidad(p_oportunidad) then
    raise exception 'Esta oportunidad no es tuya.';
  end if;
  if o.pipeline <> 'ventas' or o.estado_cierre <> 'abierta' then
    raise exception 'Solo las oportunidades abiertas de Ventas se pueden convertir en venta directa.';
  end if;
  update oportunidades set origen = 'venta_directa' where id = p_oportunidad;
  update tareas set estado = 'cancelada'
   where oportunidad_id = p_oportunidad and estado = 'pendiente';
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function convertir_a_venta_directa(uuid) from public;
grant execute on function convertir_a_venta_directa(uuid) to authenticated;
