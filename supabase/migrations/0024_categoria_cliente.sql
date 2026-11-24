-- ============================================================================
-- CRM Rhinoboots — categoría del cliente: Distribuidor o Cliente empresa.
-- Es distinta de tipo_cliente (Nuevo / Cartera). Null = aún sin clasificar,
-- para ir marcándolos poco a poco.
-- ============================================================================
alter table clientes add column if not exists categoria_cliente text
  check (categoria_cliente in ('Distribuidor', 'Cliente empresa'));
