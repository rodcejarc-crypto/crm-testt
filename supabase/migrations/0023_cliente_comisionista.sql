-- ============================================================================
-- CRM Rhinoboots — clientes de comisionista: el cliente le pertenece a un
-- comisionista externo y el ejecutivo solo apoya con el trámite operativo.
-- Se guarda el nombre del comisionista (texto libre); null = cliente propio.
-- ============================================================================
alter table clientes add column if not exists comisionista text;
