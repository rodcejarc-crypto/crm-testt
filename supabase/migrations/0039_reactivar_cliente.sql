-- ============================================================================
-- CRM Rhinoboots — Reactivar un cliente de Recuperación de cartera SIN perder
-- el historial.
--
-- Al reactivar: la oportunidad de Recuperación se cierra en "Reactivada" y se
-- conserva completa; el cliente pasa a Activo (Cartera); se crea una oportunidad
-- de Ventas ligada a la de recuperación (con renglones, valor y notas copiados);
-- los seguimientos pendientes del calendario de recuperación quedan "cerrados por
-- reactivación" (no se borran).
-- ============================================================================

alter table oportunidades add column if not exists origen_recuperacion_id uuid
  references oportunidades(id) on delete set null;
create index if not exists oportunidades_origen_recuperacion_idx on oportunidades (origen_recuperacion_id);

-- Por qué se cerró un seguimiento sin hacerse (ej. 'reactivacion').
alter table tareas add column if not exists motivo_cierre text;

-- La venta de una reactivación nace en la oportunidad de Ventas ligada; la
-- oportunidad de Recuperación ya no registra una venta propia (evita contarla
-- dos veces). Igual que 0031, más esas dos reglas.
create or replace function trg_registrar_venta_cerrada()
returns trigger as $$
declare
  v_empresa text;
  v_tipo_cliente text;
  v_vendedor_nombre text;
  v_unidad text;
  v_tipo_venta text;
  v_total numeric;
begin
  if new.estado_cierre = 'ganada' and (
       (new.pipeline = 'ventas' and new.etapa = 'Cerrada Ganada') or
       (new.pipeline = 'licitaciones' and new.etapa = 'Adjudicada') or
       (new.pipeline = 'recuperacion' and new.etapa = 'Reactivada')
     ) then

    if new.pipeline = 'recuperacion'
       and exists (select 1 from oportunidades x where x.origen_recuperacion_id = new.id) then
      return new;
    end if;

    select empresa, tipo_cliente into v_empresa, v_tipo_cliente
      from clientes where id = new.cliente_id;

    select nombre, unidad_negocio into v_vendedor_nombre, v_unidad
      from vendedores where id = new.dueno_comercial_id;

    if new.pipeline = 'licitaciones' then
      v_tipo_venta := 'Licitación';
      v_total := new.monto_estimado;
    elsif new.pipeline = 'recuperacion' then
      v_tipo_venta := 'Recompra';
      v_total := new.valor_estimado;
    elsif new.origen_recuperacion_id is not null then
      v_tipo_venta := 'Recompra';
      v_total := new.valor_estimado;
    else
      v_tipo_venta := case when v_tipo_cliente = 'Cartera' then 'Expansión' else 'Nuevo' end;
      v_total := new.valor_estimado;
    end if;

    insert into ventas_cerradas (
      oportunidad_id, fecha_cierre, cliente_id, empresa, dueno_comercial_id,
      vendedor_nombre, unidad_negocio, pipeline, tipo_venta,
      pares_vendidos, total_facturado, contexto_meta, orden_compra
    ) values (
      new.id, coalesce(new.fecha_cierre, now()), new.cliente_id, coalesce(v_empresa, 'Cliente'),
      new.dueno_comercial_id, v_vendedor_nombre, v_unidad, new.pipeline, v_tipo_venta,
      new.pares_vendidos, v_total, new.contexto_meta, new.orden_compra
    )
    on conflict (oportunidad_id) do update set
      fecha_cierre = excluded.fecha_cierre,
      cliente_id = excluded.cliente_id,
      empresa = excluded.empresa,
      dueno_comercial_id = excluded.dueno_comercial_id,
      vendedor_nombre = excluded.vendedor_nombre,
      unidad_negocio = excluded.unidad_negocio,
      pipeline = excluded.pipeline,
      tipo_venta = excluded.tipo_venta,
      pares_vendidos = excluded.pares_vendidos,
      total_facturado = excluded.total_facturado,
      contexto_meta = excluded.contexto_meta,
      orden_compra = excluded.orden_compra;
      -- "factura" nunca se toca aquí: se conserva lo que haya capturado el equipo.

    perform reconstruir_lineas_venta(new.id);
  end if;

  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- Reactivar: no borra nada. Devuelve el id de la nueva oportunidad de Ventas.
-- ----------------------------------------------------------------------------
create or replace function reactivar_cliente(p_oportunidad uuid, p_etapa text)
returns uuid as $$
declare
  o oportunidades%rowtype;
  v_nueva uuid;
  v_n int;
begin
  select * into o from oportunidades where id = p_oportunidad;
  if not found then
    raise exception 'No se encontró la oportunidad.';
  end if;
  if not puede_ver_oportunidad(p_oportunidad) then
    raise exception 'Esta oportunidad no es tuya.';
  end if;
  if o.pipeline <> 'recuperacion' or o.estado_cierre <> 'abierta' then
    raise exception 'Solo las cuentas abiertas de Recuperación se pueden reactivar.';
  end if;
  if p_etapa not in ('Negociación', 'Cerrada Ganada') then
    raise exception 'Elige la etapa inicial: Negociación o Cerrada Ganada.';
  end if;

  select count(*) into v_n from oportunidad_partidas where oportunidad_id = p_oportunidad;
  if p_etapa = 'Cerrada Ganada' then
    if v_n = 0 and coalesce(o.valor_estimado, 0) <= 0 then
      raise exception 'Para reactivar como Cerrada Ganada captura primero los renglones del pedido (o el valor). Si todavía no hay pedido, elige Negociación.';
    end if;
    if exists (select 1 from oportunidad_partidas where oportunidad_id = p_oportunidad and linea is null) then
      raise exception 'Elige la línea de producto (Piel / PVC / Económico) de cada renglón del pedido antes de reactivar como Cerrada Ganada.';
    end if;
  end if;

  -- 1) Oportunidad de Ventas ligada (si ya hay pedido, es una venta directa:
  --    el cliente ya pidió, no pasa por el embudo).
  insert into oportunidades (
    cliente_id, pipeline, etapa, dueno_comercial_id, valor_estimado, notas,
    pares_vendidos, orden_compra, origen, origen_recuperacion_id
  ) values (
    o.cliente_id, 'ventas', 'Negociación', o.dueno_comercial_id, o.valor_estimado,
    trim(both ' ' from 'Viene de Recuperación de cartera.' || coalesce(' ' || o.notas, '')),
    o.pares_vendidos, o.orden_compra,
    case when p_etapa = 'Cerrada Ganada' then 'venta_directa' else 'embudo' end,
    p_oportunidad
  ) returning id into v_nueva;

  -- 2) Renglones del pedido
  insert into oportunidad_partidas (oportunidad_id, estilo, linea, pares, precio_unitario, orden)
  select v_nueva, estilo, linea, pares, precio_unitario, orden
  from oportunidad_partidas where oportunidad_id = p_oportunidad;

  -- 3) Seguimientos pendientes del calendario de recuperación: cerrados por
  --    reactivación (no se borran). Los de una prueba de muestras se respetan.
  update tareas set estado = 'cancelada', motivo_cierre = 'reactivacion'
   where oportunidad_id = p_oportunidad and estado = 'pendiente' and muestra_id is null;

  -- 4) Cierra la de Recuperación en "Reactivada" (éxito) conservando todo
  update oportunidades
     set etapa = 'Reactivada', estado_cierre = 'ganada', fecha_cierre = now()
   where id = p_oportunidad;

  -- 5) Cliente activo, mismo dueño comercial
  update clientes set tipo_cliente = 'Cartera' where id = o.cliente_id;

  -- 6) Si ya hay pedido, la oportunidad de Ventas se cierra ganada (registra la venta)
  if p_etapa = 'Cerrada Ganada' then
    update oportunidades
       set etapa = 'Cerrada Ganada', estado_cierre = 'ganada', fecha_cierre = now()
     where id = v_nueva;
  end if;

  return v_nueva;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function reactivar_cliente(uuid, text) from public;
grant execute on function reactivar_cliente(uuid, text) to authenticated;
