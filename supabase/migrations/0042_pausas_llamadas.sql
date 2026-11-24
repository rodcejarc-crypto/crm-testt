-- ============================================================================
-- CRM Rhinoboots — Pausar las llamadas de cartera de un vendedor por un periodo.
--
-- · Mientras dura la pausa no se le cargan llamadas nuevas.
-- · Sus llamadas pendientes (de hoy y atrasadas) se ocultan: quedan canceladas con
--   motivo 'pausa_vendedor' (no se borran, no cuentan como "no registradas") y sus
--   clientes vuelven a estar disponibles para la carga normal. Las que el cliente
--   pidió reprogramar ("llámame después") no se pierden: pasan al día siguiente
--   al fin de la pausa.
-- · Al terminar la pausa el vendedor vuelve solo a su "llamadas al día" de antes
--   (la pausa no toca ese número).
-- · Cada pausa queda en un historial (quién, fechas, motivo).
-- · Un vendedor sin "llamadas al día" (vacío o 0) tampoco tiene llamadas pendientes a
--   la vista: se ocultan igual.
-- ============================================================================

create table if not exists llamadas_pausas (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  desde date not null,
  hasta date not null,
  motivo text not null,
  creado_por uuid references vendedores(id) on delete set null,
  creado_en timestamptz not null default now(),
  cancelada_en timestamptz,
  cancelada_por uuid references vendedores(id) on delete set null,
  constraint llamadas_pausas_fechas check (hasta >= desde),
  constraint llamadas_pausas_motivo check (length(trim(motivo)) >= 3)
);
create index if not exists llamadas_pausas_vendedor_idx on llamadas_pausas (vendedor_id, desde, hasta);

alter table llamadas_pausas enable row level security;
drop policy if exists "llamadas_pausas_select" on llamadas_pausas;
create policy "llamadas_pausas_select" on llamadas_pausas for select to authenticated
  using (es_admin() or vendedor_id = mi_vendedor_id() or vendedor_id in (select vendedores_de_mi_unidad()));
-- Sin políticas de escritura: solo se escribe con pausar_llamadas() / cancelar_pausa_llamadas().

-- Hoy en México.
create or replace function dia_mx() returns date as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$ language sql stable;

-- ¿Tiene el vendedor una pausa vigente ese día?
create or replace function vendedor_en_pausa(p_vendedor uuid, p_dia date default null)
returns boolean as $$
  select exists (
    select 1 from llamadas_pausas
     where vendedor_id = p_vendedor and cancelada_en is null
       and coalesce(p_dia, dia_mx()) between desde and hasta
  );
$$ language sql stable security definer set search_path = public;

-- Oculta las llamadas pendientes de un vendedor. Si se da p_mover_a, las que el cliente
-- pidió reprogramar no se cancelan: pasan a esa fecha.
create or replace function ocultar_llamadas_pendientes(p_vendedor uuid, p_motivo text, p_mover_a date default null)
returns int as $$
declare
  n int;
begin
  update tareas set estado = 'cancelada', motivo_cierre = p_motivo
   where tipo = 'llamada_cartera' and estado = 'pendiente' and dueno_comercial_id = p_vendedor
     and (p_mover_a is null or not reprogramada);
  get diagnostics n = row_count;

  if p_mover_a is not null then
    update tareas set fecha_vencimiento = p_mover_a
     where tipo = 'llamada_cartera' and estado = 'pendiente' and dueno_comercial_id = p_vendedor
       and reprogramada and fecha_vencimiento < p_mover_a;
  end if;
  return n;
end;
$$ language plpgsql security definer set search_path = public;

-- Aplica las pausas vigentes y la regla de "sin llamadas al día" (la corre la carga diaria).
create or replace function aplicar_pausas_llamadas(p_dia date default null)
returns void as $$
declare
  r record;
  v record;
  d date := coalesce(p_dia, dia_mx());
begin
  for r in
    select vendedor_id, max(hasta) as hasta from llamadas_pausas
     where cancelada_en is null and d between desde and hasta
     group by vendedor_id
  loop
    perform ocultar_llamadas_pendientes(r.vendedor_id, 'pausa_vendedor', r.hasta + 1);
  end loop;

  for v in
    select id from vendedores
     where coalesce(meta_llamadas_diarias, 0) = 0
       and exists (select 1 from tareas t where t.tipo = 'llamada_cartera' and t.estado = 'pendiente' and t.dueno_comercial_id = vendedores.id)
  loop
    perform ocultar_llamadas_pendientes(v.id, 'sin_meta', null);
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- Al crear (o cambiar) una pausa que ya está vigente, se aplica de inmediato.
create or replace function trg_llamadas_pausas_aplicar() returns trigger as $$
begin
  if new.cancelada_en is null and dia_mx() between new.desde and new.hasta then
    perform ocultar_llamadas_pendientes(new.vendedor_id, 'pausa_vendedor', new.hasta + 1);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists llamadas_pausas_aplicar on llamadas_pausas;
create trigger llamadas_pausas_aplicar
  after insert or update on llamadas_pausas
  for each row execute function trg_llamadas_pausas_aplicar();

-- Al dejar vacío (o en 0) el "llamadas al día", sus llamadas pendientes se ocultan.
create or replace function trg_vendedores_sin_meta_ocultar() returns trigger as $$
begin
  if coalesce(new.meta_llamadas_diarias, 0) = 0 and coalesce(old.meta_llamadas_diarias, 0) > 0 then
    perform ocultar_llamadas_pendientes(new.id, 'sin_meta', null);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists vendedores_sin_meta_ocultar on vendedores;
create trigger vendedores_sin_meta_ocultar
  after update of meta_llamadas_diarias on vendedores
  for each row execute function trg_vendedores_sin_meta_ocultar();

-- ----------------------------------------------------------------------------
-- Pantalla de Vendedores: pausar y cancelar una pausa (solo la administración general).
-- ----------------------------------------------------------------------------
create or replace function pausar_llamadas(p_vendedor uuid, p_desde date, p_hasta date, p_motivo text)
returns uuid as $$
declare
  v vendedores%rowtype;
  v_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo la administración general puede pausar llamadas.';
  end if;
  select * into v from vendedores where id = p_vendedor;
  if not found then
    raise exception 'No se encontró al vendedor.';
  end if;
  if coalesce(v.meta_llamadas_diarias, 0) = 0 then
    raise exception 'Este vendedor no está en el programa de llamadas (su "llamadas al día" está vacío).';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Indica la fecha de inicio y la de fin.';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.';
  end if;
  if p_desde < dia_mx() then
    raise exception 'La fecha de inicio no puede ser anterior a hoy.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo de la pausa.';
  end if;
  if exists (
    select 1 from llamadas_pausas
     where vendedor_id = p_vendedor and cancelada_en is null
       and p_desde <= hasta and p_hasta >= desde
  ) then
    raise exception 'Ya hay una pausa en esas fechas para este vendedor. Cancélala primero.';
  end if;

  insert into llamadas_pausas (vendedor_id, desde, hasta, motivo, creado_por)
  values (p_vendedor, p_desde, p_hasta, trim(p_motivo), mi_vendedor_id())
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function pausar_llamadas(uuid, date, date, text) from public;
grant execute on function pausar_llamadas(uuid, date, date, text) to authenticated;

create or replace function cancelar_pausa_llamadas(p_pausa uuid)
returns void as $$
begin
  if not es_admin() then
    raise exception 'Solo la administración general puede cancelar una pausa.';
  end if;
  update llamadas_pausas set cancelada_en = now(), cancelada_por = mi_vendedor_id()
   where id = p_pausa and cancelada_en is null and hasta >= dia_mx();
  if not found then
    raise exception 'Esa pausa ya terminó o ya estaba cancelada.';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function cancelar_pausa_llamadas(uuid) from public;
grant execute on function cancelar_pausa_llamadas(uuid) to authenticated;

-- Las funciones internas solo las usa la propia base (y la carga diaria).
revoke all on function ocultar_llamadas_pendientes(uuid, text, date) from public;
revoke all on function ocultar_llamadas_pendientes(uuid, text, date) from authenticated;
grant execute on function ocultar_llamadas_pendientes(uuid, text, date) to service_role;
revoke all on function aplicar_pausas_llamadas(date) from public;
revoke all on function aplicar_pausas_llamadas(date) from authenticated;
grant execute on function aplicar_pausas_llamadas(date) to service_role;
revoke all on function vendedor_en_pausa(uuid, date) from public;
grant execute on function vendedor_en_pausa(uuid, date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Carga diaria (igual que en 0041) que respeta las pausas.
-- ----------------------------------------------------------------------------
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
    select id, nombre, meta_llamadas_diarias as meta from vendedores
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
          and not exists (select 1 from tareas t where t.tipo = 'llamada_cartera' and t.cliente_id = c.id and t.estado = 'pendiente')
          and motivo_no_apto_llamada(c.id, p_dia) is null
        order by (c.nivel_cuenta = 'Estratégica') desc, c.total_historico desc nulls last,
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
