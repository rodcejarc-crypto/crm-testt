-- ============================================================================
-- CRM Rhinoboots — la búsqueda global (aviso de "ya existe" y buscador de
-- Dirección Comercial) ya no debe traer clientes descartados (ilocalizables,
-- dados de baja del listado normal): no tendría sentido avisar de un
-- duplicado, o dejarlo navegar, sobre un cliente que ya se dio por perdido.
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
    and not c.descartado
    and (
      c.empresa ilike '%' || p_texto || '%'
      or c.rfc ilike '%' || p_texto || '%'
    )
    and (
      not es_admin_unidad()
      or c.dueno_comercial_id in (select vendedores_de_mi_unidad())
    )
  order by c.empresa
  limit 50;
$$ language sql stable security definer set search_path = public;
