-- ============================================================================
-- CRM Rhinoboots — observaciones de los vendedores (octubre 2026):
--  1. Número de orden de compra en el pedido y en la venta.
--  2. Embarques parciales: la venta cuenta lo realmente embarcado, no el
--     pedido completo (cada renglón puede llevar "pares embarcados").
--  3. Cargo por flete como renglón del pedido (suma al total facturado, no
--     a los pares).
--  4. Eliminar una venta duplicada por error, dejando registro de quién,
--     cuándo y por qué.
--  5. Si se corrige el nombre de un cliente, se actualiza también en Ventas.
-- ============================================================================

-- 1) Orden de compra
alter table oportunidades add column if not exists orden_compra text;
alter table ventas_cerradas add column if not exists orden_compra text;

-- 2) y 3) Renglones: pares embarcados y línea "Flete"
alter table oportunidad_partidas add column if not exists pares_embarcados numeric
  check (pares_embarcados is null or pares_embarcados >= 0);
alter table oportunidad_partidas add column if not exists monto_embarcado numeric
  generated always as (coalesce(pares_embarcados, pares) * precio_unitario) stored;

alter table oportunidad_partidas drop constraint if exists oportunidad_partidas_linea_check;
alter table oportunidad_partidas add constraint oportunidad_partidas_linea_check
  check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico', 'Plantillas', 'Flete'));

alter table ventas_lineas drop constraint if exists ventas_lineas_linea_check;
alter table ventas_lineas add constraint ventas_lineas_linea_check
  check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico', 'Plantillas', 'Flete'));

-- Reconstruye el desglose por línea de la venta y recalcula sus pares y su
-- total a partir de lo EMBARCADO (si un renglón no trae pares_embarcados, se
-- toma todo el renglón). Los pares son solo de calzado.
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
  select v_venta, linea,
         case when linea = 'Flete' then 0 else sum(coalesce(pares_embarcados, pares)) end,
         sum(monto_embarcado)
  from oportunidad_partidas
  where oportunidad_id = p_oportunidad and linea is not null
  group by linea;

  update ventas_cerradas set
    pares_vendidos = (
      select coalesce(sum(coalesce(pares_embarcados, pares)), 0)
      from oportunidad_partidas
      where oportunidad_id = p_oportunidad
        and linea is distinct from 'Plantillas' and linea is distinct from 'Flete'
    ),
    total_facturado = (
      select coalesce(sum(monto_embarcado), 0)
      from oportunidad_partidas where oportunidad_id = p_oportunidad
    )
  where id = v_venta;
end;
$$ language plpgsql security definer set search_path = public;

-- En la oportunidad: valor = total del PEDIDO; pares = calzado embarcado.
create or replace function sincronizar_oportunidad_desde_partidas(p_oportunidad uuid)
returns void as $$
declare
  v_n int;
  v_pares numeric;
  v_monto numeric;
  v_pipeline text;
begin
  select count(*),
         coalesce(sum(coalesce(pares_embarcados, pares))
                  filter (where linea is distinct from 'Plantillas' and linea is distinct from 'Flete'), 0),
         coalesce(sum(monto), 0)
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

-- La venta también guarda la orden de compra de la oportunidad.
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
$$ language plpgsql security definer set search_path = public;

-- 4) Eliminar una venta duplicada por error (con registro de auditoría)
create table if not exists ventas_eliminadas (
  id uuid primary key default gen_random_uuid(),
  venta jsonb not null,
  oportunidad jsonb,
  motivo text not null,
  eliminado_por uuid references vendedores(id) on delete set null,
  eliminado_en timestamptz not null default now()
);
alter table ventas_eliminadas enable row level security;
drop policy if exists "ventas_eliminadas_select" on ventas_eliminadas;
create policy "ventas_eliminadas_select" on ventas_eliminadas for select to authenticated
  using (es_admin());

-- Quien puede: administración general, el admin de la unidad, o el vendedor
-- dueño de la venta (este último solo si todavía no está cobrada). Se borra
-- la venta junto con su oportunidad duplicada (renglones, seguimientos e
-- historial incluidos), y queda guardada una copia con el motivo.
create or replace function eliminar_venta_duplicada(p_venta uuid, p_motivo text)
returns void as $$
declare
  v ventas_cerradas%rowtype;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo por el que se elimina la venta.';
  end if;

  select * into v from ventas_cerradas where id = p_venta;
  if not found then
    raise exception 'No se encontró la venta.';
  end if;

  if not (
    es_admin()
    or (es_admin_unidad() and v.dueno_comercial_id in (select vendedores_de_mi_unidad()))
    or (v.dueno_comercial_id = mi_vendedor_id() and v.estado_cobro <> 'Cobrada')
  ) then
    raise exception 'No tienes permiso para eliminar esta venta (si ya está cobrada, pídeselo a un administrador).';
  end if;

  insert into ventas_eliminadas (venta, oportunidad, motivo, eliminado_por)
  values (
    to_jsonb(v),
    (select to_jsonb(o) from oportunidades o where o.id = v.oportunidad_id),
    trim(p_motivo),
    mi_vendedor_id()
  );

  delete from oportunidades where id = v.oportunidad_id;
  delete from ventas_cerradas where id = p_venta;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function eliminar_venta_duplicada(uuid, text) from public;
grant execute on function eliminar_venta_duplicada(uuid, text) to authenticated;

-- 5) Si se corrige el nombre del cliente, Ventas lo refleja
create or replace function trg_clientes_renombrar_ventas()
returns trigger as $$
begin
  if new.empresa is distinct from old.empresa then
    update ventas_cerradas set empresa = new.empresa where cliente_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists clientes_renombrar_ventas on clientes;
create trigger clientes_renombrar_ventas
  after update of empresa on clientes
  for each row execute function trg_clientes_renombrar_ventas();
