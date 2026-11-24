-- ============================================================================
-- CRM Rhinoboots — Plantillas: además de calzado, la compañía vende
-- plantillas. Se capturan como una línea más del pedido ("Plantillas"),
-- con su cantidad y precio, y cuentan en el total facturado — pero NO se
-- suman a los "pares vendidos" (esa cifra es de calzado y alimenta las
-- metas y el dashboard).
-- ============================================================================
alter table oportunidad_partidas drop constraint if exists oportunidad_partidas_linea_check;
alter table oportunidad_partidas add constraint oportunidad_partidas_linea_check
  check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico', 'Plantillas'));

alter table ventas_lineas drop constraint if exists ventas_lineas_linea_check;
alter table ventas_lineas add constraint ventas_lineas_linea_check
  check (linea in ('Calzado de Piel', 'PVC', 'Calzado Económico', 'Plantillas'));

create or replace function sincronizar_oportunidad_desde_partidas(p_oportunidad uuid)
returns void as $$
declare
  v_n int;
  v_pares numeric;
  v_monto numeric;
  v_pipeline text;
begin
  select count(*),
         coalesce(sum(pares) filter (where linea is distinct from 'Plantillas'), 0),
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
