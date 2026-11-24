-- ============================================================================
-- CRM Rhinoboots — unidad de negocio por vendedor
-- Pégalo en el SQL Editor de Supabase y dale "Run".
-- ============================================================================

alter table vendedores
  add column if not exists unidad_negocio text;
