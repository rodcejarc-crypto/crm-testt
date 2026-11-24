-- ============================================================================
-- CRM Rhinoboots — Las llamadas pendientes NO se pierden.
--
-- 1) Vaciar o cambiar "Llamadas al día" ya no oculta ni libera las llamadas
--    pendientes del vendedor: solo afecta las cargas futuras. (El 21 de nov de 2026
--    vaciar ese campo canceló 441 llamadas pendientes de 9 vendedores.)
-- 2) La pausa de llamadas tiene la casilla "mantener visibles las llamadas
--    pendientes" (por defecto, sí). Solo si se desmarca, la pausa oculta las
--    pendientes (quedan canceladas, no se borran).
-- 3) "Pausar a todos": aplica la misma pausa a todos los vendedores con llamadas al día.
-- ============================================================================

-- 1) Ya no se ocultan las pendientes al vaciar "llamadas al día".
drop trigger if exists vendedores_sin_meta_ocultar on vendedores;
drop function if exists trg_vendedores_sin_meta_ocultar();

-- 2) Casilla en cada pausa.
alter table llamadas_pausas add column if not exists mantener_pendientes boolean not null default true;

-- La carga diaria solo oculta pendientes de las pausas que NO las mantienen.
create or replace function aplicar_pausas_llamadas(p_dia date default null)
returns void as $$
declare
  r record;
  d date := coalesce(p_dia, dia_mx());
begin
  for r in
    select vendedor_id, max(hasta) as hasta from llamadas_pausas
     where cancelada_en is null and not mantener_pendientes and d between desde and hasta
     group by vendedor_id
  loop
    perform ocultar_llamadas_pendientes(r.vendedor_id, 'pausa_vendedor', r.hasta + 1);
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function aplicar_pausas_llamadas(date) from public;
revoke all on function aplicar_pausas_llamadas(date) from authenticated;
grant execute on function aplicar_pausas_llamadas(date) to service_role;

-- Al crear una pausa vigente que NO mantiene las pendientes, se ocultan de inmediato.
create or replace function trg_llamadas_pausas_aplicar() returns trigger as $$
begin
  if new.cancelada_en is null and not new.mantener_pendientes and dia_mx() between new.desde and new.hasta then
    perform ocultar_llamadas_pendientes(new.vendedor_id, 'pausa_vendedor', new.hasta + 1);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists llamadas_pausas_aplicar on llamadas_pausas;
create trigger llamadas_pausas_aplicar
  after insert or update on llamadas_pausas
  for each row execute function trg_llamadas_pausas_aplicar();

-- Pausar a un vendedor (con la casilla).
drop function if exists pausar_llamadas(uuid, date, date, text);
create or replace function pausar_llamadas(
  p_vendedor uuid, p_desde date, p_hasta date, p_motivo text, p_mantener_pendientes boolean default true
) returns uuid as $$
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

  insert into llamadas_pausas (vendedor_id, desde, hasta, motivo, creado_por, mantener_pendientes)
  values (p_vendedor, p_desde, p_hasta, trim(p_motivo), mi_vendedor_id(), coalesce(p_mantener_pendientes, true))
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function pausar_llamadas(uuid, date, date, text, boolean) from public;
grant execute on function pausar_llamadas(uuid, date, date, text, boolean) to authenticated;

-- 3) Pausar a todos los vendedores con llamadas al día.
create or replace function pausar_llamadas_todos(
  p_desde date, p_hasta date, p_motivo text, p_mantener_pendientes boolean default true
) returns table (pausados int, omitidos int) as $$
declare
  v record;
  n_ok int := 0;
  n_omitidos int := 0;
begin
  if not es_admin() then
    raise exception 'Solo la administración general puede pausar llamadas.';
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

  for v in select id from vendedores where activo and coalesce(meta_llamadas_diarias, 0) > 0 loop
    if exists (
      select 1 from llamadas_pausas
       where vendedor_id = v.id and cancelada_en is null and p_desde <= hasta and p_hasta >= desde
    ) then
      n_omitidos := n_omitidos + 1;
      continue;
    end if;
    insert into llamadas_pausas (vendedor_id, desde, hasta, motivo, creado_por, mantener_pendientes)
    values (v.id, p_desde, p_hasta, trim(p_motivo), mi_vendedor_id(), coalesce(p_mantener_pendientes, true));
    n_ok := n_ok + 1;
  end loop;

  return query select n_ok, n_omitidos;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function pausar_llamadas_todos(date, date, text, boolean) from public;
grant execute on function pausar_llamadas_todos(date, date, text, boolean) to authenticated;
