-- ============================================================================
-- CRM Rhinoboots — motor de comisiones
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

-- Contexto de meta (ej. "B2B" / "Tienda") al que pertenece una venta, para
-- vendedores con más de una meta el mismo mes. Se captura al cerrar la
-- venta; si el vendedor solo tiene una meta ese mes, no hace falta.
alter table oportunidades add column if not exists contexto_meta text;
alter table ventas_cerradas add column if not exists contexto_meta text;

-- Actualiza el trigger que llena ventas_cerradas para que también copie
-- el contexto de meta.
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
    else
      v_tipo_venta := case when v_tipo_cliente = 'Cartera' then 'Expansión' else 'Nuevo' end;
      v_total := new.valor_estimado;
    end if;

    insert into ventas_cerradas (
      oportunidad_id, fecha_cierre, cliente_id, empresa, dueno_comercial_id,
      vendedor_nombre, unidad_negocio, pipeline, tipo_venta,
      pares_vendidos, total_facturado, contexto_meta
    ) values (
      new.id, coalesce(new.fecha_cierre, now()), new.cliente_id, coalesce(v_empresa, 'Cliente'),
      new.dueno_comercial_id, v_vendedor_nombre, v_unidad, new.pipeline, v_tipo_venta,
      new.pares_vendidos, v_total, new.contexto_meta
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
      contexto_meta = excluded.contexto_meta;
      -- "factura" nunca se toca aquí: se conserva lo que haya capturado el equipo.
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Tarifa cuando NO se llegó a "la llave" (85% del piso de Piel). Piel
-- siempre usa tarifa_por_par sin importar la llave (nunca cambia).
alter table tarifas_mensuales add column if not exists tarifa_sin_llave numeric not null default 0;

-- Bono por par (acelerador), aparte del multiplicador que ya existía.
alter table reglas_acelerador add column if not exists bono_por_par numeric not null default 0;

-- Condición de visitas para el acelerador, capturada junto con la meta del
-- mes (así puede cambiar de un mes a otro sin tocar código).
alter table metas_mensuales add column if not exists visitas_requeridas numeric;
alter table metas_mensuales add column if not exists visitas_para_id uuid references vendedores(id);
