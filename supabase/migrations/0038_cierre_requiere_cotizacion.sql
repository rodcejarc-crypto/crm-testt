-- ============================================================================
-- CRM Rhinoboots — regla: una oportunidad del embudo solo se cierra como ganada
-- si llegó a "Cotización enviada". Va aparte de 0037 para activarla hasta que
-- el botón "Es una venta directa" / "Registrar venta" ya esté publicado.
-- ============================================================================

-- Una oportunidad del embudo no se puede cerrar como ganada si nunca llegó a
-- "Cotización enviada": eso es una venta directa.
create or replace function trg_cierre_requiere_cotizacion()
returns trigger as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null
     and new.pipeline = 'ventas' and new.origen = 'embudo'
     and new.estado_cierre = 'ganada' and old.estado_cierre is distinct from 'ganada'
     and old.etapa not in ('Cotización enviada', 'Negociación')
     and not exists (
       select 1 from oportunidad_historial h
       where h.oportunidad_id = new.id and h.etapa_nueva in ('Cotización enviada', 'Negociación')
     ) then
    raise exception 'Esta oportunidad nunca llegó a "Cotización enviada". Si el cliente ya te hizo el pedido, conviértela en venta directa con el botón "Es una venta directa" (o usa "Registrar venta" desde Ventas).';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists oportunidades_cierre_requiere_cotizacion on oportunidades;
create trigger oportunidades_cierre_requiere_cotizacion
  before update on oportunidades
  for each row execute function trg_cierre_requiere_cotizacion();
