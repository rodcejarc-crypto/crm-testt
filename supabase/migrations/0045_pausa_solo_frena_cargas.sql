-- ============================================================================
-- CRM Rhinoboots — La pausa de llamadas SOLO frena la carga de clientes nuevos.
--
-- Antes (0042) además ocultaba las llamadas que el vendedor ya tenía pendientes.
-- Ahora no: durante la pausa no se le cargan llamadas nuevas, pero puede seguir
-- gestionando las que ya tenía. (Quien tiene "llamadas al día" vacío sigue sin
-- llamadas a la vista, como antes.)
-- ============================================================================

-- Ya no se ocultan las pendientes al crear o cambiar una pausa.
drop trigger if exists llamadas_pausas_aplicar on llamadas_pausas;
drop function if exists trg_llamadas_pausas_aplicar();

-- La carga diaria solo aplica la regla de "sin llamadas al día"; las pausas solo
-- las consulta asignar_llamadas_diarias() para no cargar a quien está en pausa.
create or replace function aplicar_pausas_llamadas(p_dia date default null)
returns void as $$
declare
  v record;
begin
  for v in
    select id from vendedores
     where coalesce(meta_llamadas_diarias, 0) = 0
       and exists (select 1 from tareas t where t.tipo = 'llamada_cartera' and t.estado = 'pendiente' and t.dueno_comercial_id = vendedores.id)
  loop
    perform ocultar_llamadas_pendientes(v.id, 'sin_meta', null);
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function aplicar_pausas_llamadas(date) from public;
revoke all on function aplicar_pausas_llamadas(date) from authenticated;
grant execute on function aplicar_pausas_llamadas(date) to service_role;
