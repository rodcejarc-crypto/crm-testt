-- ============================================================================
-- CRM Rhinoboots — ajuste del validador de visitas (0033): al borrar un
-- cliente o una oportunidad con visitas ligadas, la base de datos suelta el
-- enlace automáticamente (cliente_id / oportunidad_id quedan en null). El
-- validador solo debe revisar la coherencia cuando alguien liga o cambia el
-- cliente/oportunidad, no en ese borrado automático.
-- ============================================================================
create or replace function trg_visitas_validar()
returns trigger as $$
declare
  v_op oportunidades%rowtype;
  v_cambio_enlace boolean;
begin
  if tg_op = 'INSERT' and new.cliente_id is null then
    raise exception 'Elige el cliente de la visita.';
  end if;

  v_cambio_enlace := tg_op = 'INSERT'
    or new.oportunidad_id is distinct from old.oportunidad_id
    or new.cliente_id is distinct from old.cliente_id;

  if new.oportunidad_id is not null and v_cambio_enlace and not (tg_op = 'UPDATE' and new.cliente_id is null and old.cliente_id is not null) then
    select * into v_op from oportunidades where id = new.oportunidad_id;
    if not found then
      raise exception 'No se encontró esa oportunidad.';
    end if;
    if new.cliente_id is null then
      new.cliente_id := v_op.cliente_id;
    elsif new.cliente_id <> v_op.cliente_id then
      raise exception 'La oportunidad no pertenece a ese cliente.';
    end if;
  end if;

  if new.estado = 'realizada' and (tg_op = 'INSERT' or old.estado is distinct from 'realizada') then
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'evidencias' and (storage.foldername(name))[1] = new.id::text
    ) then
      raise exception 'Sube la foto o evidencia antes de marcarla como realizada.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
