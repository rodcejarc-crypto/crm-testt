-- ============================================================================
-- CRM Rhinoboots — búsqueda global de clientes (solo consulta)
-- Pégalo en el SQL Editor de Supabase y dale "Run".
--
-- Objetivo: cualquier vendedor puede buscar por empresa/ciudad/RFC y
-- confirmar si un cliente YA EXISTE en cualquier parte de la empresa y
-- quién es su dueño — sin poder ver el resto de sus datos ni editarlo.
-- Se logra con funciones "security definer" (se saltan el RLS) que solo
-- devuelven un puñado de columnas, nunca la fila completa.
-- ============================================================================

create or replace function buscar_clientes_global(p_texto text)
returns table (
  id uuid,
  empresa text,
  ciudad text,
  estado text,
  rfc text,
  tipo_cliente text,
  nivel_cuenta text,
  dueno_comercial_id uuid,
  dueno_nombre text
) as $$
  select c.id, c.empresa, c.ciudad, c.estado, c.rfc, c.tipo_cliente, c.nivel_cuenta,
         c.dueno_comercial_id, v.nombre as dueno_nombre
  from clientes c
  left join vendedores v on v.id = c.dueno_comercial_id
  where p_texto is not null and length(trim(p_texto)) > 0
    and (
      c.empresa ilike '%' || p_texto || '%'
      or c.ciudad ilike '%' || p_texto || '%'
      or c.rfc ilike '%' || p_texto || '%'
    )
  order by c.empresa
  limit 50;
$$ language sql stable security definer set search_path = public;

revoke all on function buscar_clientes_global(text) from public;
grant execute on function buscar_clientes_global(text) to authenticated;

-- La detección de duplicados (al crear un cliente) también debe revisar
-- TODA la empresa, no solo los clientes propios de quien está creando.
create or replace function buscar_clientes_similares(p_nombre text, p_umbral real default 0.3)
returns table (
  id uuid,
  empresa text,
  ciudad text,
  dueno_nombre text,
  similitud real
) as $$
  select c.id, c.empresa, c.ciudad, v.nombre as dueno_nombre,
         similarity(c.empresa, p_nombre) as similitud
  from clientes c
  left join vendedores v on v.id = c.dueno_comercial_id
  where similarity(c.empresa, p_nombre) > p_umbral
  order by similitud desc
  limit 5;
$$ language sql stable security definer set search_path = public;

revoke all on function buscar_clientes_similares(text, real) from public;
grant execute on function buscar_clientes_similares(text, real) to authenticated;
