-- ============================================================================
-- CRM Rhinoboots — Listas de prospectos para las llamadas (ej. Guadalajara).
--
-- · clientes.origen: de qué lista viene el registro (null = cartera de siempre).
-- · clientes.observaciones: todo lo que se sabe del prospecto (datos de la lista,
--   validación contra el CRM).
-- · clientes.prioridad_prospecto: 1 = alta ... (la carga diaria va de la más alta).
-- · vendedores.llamadas_origen: si tiene valor, las llamadas diarias de ese vendedor
--   salen SOLO de esa lista (en vez de su cartera). Vacío = su cartera, como siempre.
-- ============================================================================

alter table clientes add column if not exists origen text;
alter table clientes add column if not exists observaciones text;
alter table clientes add column if not exists prioridad_prospecto smallint;
create index if not exists clientes_origen_idx on clientes (origen) where origen is not null;

alter table vendedores add column if not exists llamadas_origen text;

-- Carga diaria: igual que en 0042, pero cada vendedor llama solo a clientes de su origen
-- (cartera normal u otra lista) y, dentro de una lista, por prioridad.
create or replace function asignar_llamadas_diarias(p_dia date default current_date)
returns table (vendedor text, pendientes_antes int, asignadas int, faltaron int) as $$
declare
  v record;
  v_pend int;
  v_ya int;
  v_need int;
  v_ins int;
  v_falto int;
begin
  -- Antes de repartir: quien está en pausa (o sin "llamadas al día") no tiene llamadas pendientes a la vista.
  perform aplicar_pausas_llamadas(p_dia);

  for v in
    select id, nombre, meta_llamadas_diarias as meta, llamadas_origen as origen from vendedores
    where activo and coalesce(meta_llamadas_diarias, 0) > 0
      and not vendedor_en_pausa(id, p_dia)
  loop
    select count(*) into v_pend from tareas
     where tipo = 'llamada_cartera' and estado = 'pendiente'
       and dueno_comercial_id = v.id and fecha_vencimiento < p_dia;

    select count(*) into v_ya from tareas
     where tipo = 'llamada_cartera' and not reprogramada and estado <> 'cancelada'
       and dueno_comercial_id = v.id and fecha_vencimiento = p_dia;

    v_need := greatest(v.meta - v_ya, 0);
    v_ins := 0;

    if v_need > 0 then
      with candidatos as (
        select c.id, c.empresa
        from clientes c
        where c.dueno_comercial_id = v.id and not c.descartado
          and c.origen is not distinct from v.origen
          and not exists (select 1 from tareas t where t.tipo = 'llamada_cartera' and t.cliente_id = c.id and t.estado = 'pendiente')
          and motivo_no_apto_llamada(c.id, p_dia) is null
        order by (c.nivel_cuenta = 'Estratégica') desc, c.prioridad_prospecto nulls last, c.total_historico desc nulls last,
                 c.ultima_compra desc nulls last, c.empresa
        limit v_need
      ), ins as (
        insert into tareas (tipo, titulo, fecha_vencimiento, cliente_id, dueno_comercial_id, reprogramada)
        select 'llamada_cartera', 'Llamar a ' || empresa, p_dia, id, v.id, false from candidatos
        returning 1
      )
      select count(*) into v_ins from ins;
    end if;

    v_falto := v_need - v_ins;
    if v_falto > 0 then
      insert into llamadas_cartera_avisos (dia, vendedor_id, faltaron) values (p_dia, v.id, v_falto)
      on conflict (dia, vendedor_id) do update set faltaron = excluded.faltaron, creado_en = now();
    else
      delete from llamadas_cartera_avisos where dia = p_dia and vendedor_id = v.id;
    end if;

    vendedor := v.nombre; pendientes_antes := v_pend; asignadas := v_ins; faltaron := greatest(v_falto, 0);
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function asignar_llamadas_diarias(date) from public;
revoke all on function asignar_llamadas_diarias(date) from authenticated;
grant execute on function asignar_llamadas_diarias(date) to service_role;
