-- ============================================================================
-- CRM Rhinoboots — corrige la relación cliente_id en ventas_cerradas
-- Pégalo en el SQL Editor de Supabase y dale "Run".
--
-- Antes: borrar un cliente con ventas ya registradas fallaba (la fila de
-- ventas_cerradas quedaba "atada" a ese cliente sin poder soltarse).
-- Ahora: si se borra el cliente, la venta queda en el historial igual
-- (con el nombre de empresa que ya se guardó), solo se desvincula.
-- ============================================================================

alter table ventas_cerradas
  drop constraint if exists ventas_cerradas_cliente_id_fkey;

alter table ventas_cerradas
  add constraint ventas_cerradas_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete set null;
