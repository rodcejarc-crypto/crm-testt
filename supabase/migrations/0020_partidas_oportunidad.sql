-- ============================================================================
-- CRM Rhinoboots — partidas (renglones) de una oportunidad: un mismo cliente
-- compra varios estilos/referencias. Cada renglón lleva estilo, línea de
-- producto, pares y precio por par; el subtotal se calcula solo y el total
-- del pedido = suma de los renglones. Al cerrar como ganada, esos totales
-- llenan la venta (pares, total facturado) y el desglose por línea de
-- producto de la pestaña Ventas.
-- ============================================================================

create table if not exists oportunidad_partidas (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades(id) on delete cascade,
  estilo text not null default '',
  linea text check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico')),
  pares numeric not null default 0 check (pares >= 0),
  precio_unitario numeric not null default 0 check (precio_unitario >= 0),
  monto numeric generated always as (pares * precio_unitario) stored,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists oportunidad_partidas_op_idx on oportunidad_partidas (oportunidad_id, orden);

alter table oportunidad_partidas enable row level security;

drop policy if exists "oportunidad_partidas_todo" on oportunidad_partidas;
create policy "oportunidad_partidas_todo" on oportunidad_partidas
  for all to authenticated
  using (
    es_admin() or exists (
      select 1 from oportunidades o
      where o.id = oportunidad_id and o.dueno_comercial_id = mi_vendedor_id()
    )
  )
  with check (
    es_admin() or exists (
      select 1 from oportunidades o
      where o.id = oportunidad_id and o.dueno_comercial_id = mi_vendedor_id()
    )
  );

-- Reconstruye el desglose por línea de producto de la venta cerrada a partir
-- de las partidas (una fila por línea, sumando estilos de la misma línea).
create or replace function reconstruir_lineas_venta(p_oportunidad uuid)
returns void as $$
declare
  v_venta uuid;
begin
  select id into v_venta from ventas_cerradas where oportunidad_id = p_oportunidad;
  if v_venta is null then return; end if;
  if not exists (select 1 from oportunidad_partidas where oportunidad_id = p_oportunidad) then
    return;
  end if;

  delete from ventas_lineas where venta_id = v_venta;
  insert into ventas_lineas (venta_id, linea, pares, monto)
  select v_venta, linea, sum(pares), sum(monto)
  from oportunidad_partidas
  where oportunidad_id = p_oportunidad and linea is not null
  group by linea;
end;
$$ language plpgsql security definer set search_path = public;

-- Recalcula totales de la oportunidad desde sus partidas (pares y valor).
create or replace function sincronizar_oportunidad_desde_partidas(p_oportunidad uuid)
returns void as $$
declare
  v_n int;
  v_pares numeric;
  v_monto numeric;
  v_pipeline text;
begin
  select count(*), coalesce(sum(pares), 0), coalesce(sum(monto), 0)
    into v_n, v_pares, v_monto
    from oportunidad_partidas where oportunidad_id = p_oportunidad;

  select pipeline into v_pipeline from oportunidades where id = p_oportunidad;
  if v_pipeline is null then return; end if;

  if v_n > 0 then
    if v_pipeline = 'licitaciones' then
      update oportunidades set monto_estimado = v_monto, pares_vendidos = v_pares
        where id = p_oportunidad;
    else
      update oportunidades set valor_estimado = v_monto, pares_vendidos = v_pares
        where id = p_oportunidad;
    end if;
  end if;

  perform reconstruir_lineas_venta(p_oportunidad);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function trg_partidas_sincronizar()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform sincronizar_oportunidad_desde_partidas(old.oportunidad_id);
    return old;
  end if;
  perform sincronizar_oportunidad_desde_partidas(new.oportunidad_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists oportunidad_partidas_sync on oportunidad_partidas;
create trigger oportunidad_partidas_sync
  after insert or update or delete on oportunidad_partidas
  for each row execute function trg_partidas_sincronizar();

-- Al cerrar como ganada, además de registrar la venta, arma el desglose por
-- línea desde las partidas (mismo trigger de 0013 + esa llamada al final).
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

    perform reconstruir_lineas_venta(new.id);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
