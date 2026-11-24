-- ============================================================================
-- CRM Rhinoboots — restringir la búsqueda global de clientes
--
-- Antes: cualquier vendedor podía buscar por EMPRESA, CIUDAD o RFC y ver
-- hasta 50 clientes de TODA la empresa (nombre, ciudad, estado, tipo,
-- nivel de cuenta, dueño) como una lista navegable.
--
-- Ahora: la búsqueda por ciudad se quita (esa es la que permitía "explorar"
-- la cartera de otros). Solo queda buscar por nombre de empresa o RFC — y
-- el front-end la usa nada más para avisar "ya existe, es de fulano", no
-- para mostrar una lista con la que se pueda navegar/exportar.
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
      or c.rfc ilike '%' || p_texto || '%'
    )
  order by c.empresa
  limit 50;
$$ language sql stable security definer set search_path = public;

-- El de similares (al crear un cliente nuevo) ahora también trae
-- dueno_comercial_id, para que el front-end sepa si el duplicado es tuyo
-- (puedes abrirlo) o de alguien más (solo el aviso, sin link).
drop function if exists buscar_clientes_similares(text, real);

create function buscar_clientes_similares(p_nombre text, p_umbral real default 0.3)
returns table (
  id uuid,
  empresa text,
  ciudad text,
  dueno_comercial_id uuid,
  dueno_nombre text,
  similitud real
) as $$
  select c.id, c.empresa, c.ciudad, c.dueno_comercial_id, v.nombre as dueno_nombre,
         similarity(c.empresa, p_nombre) as similitud
  from clientes c
  left join vendedores v on v.id = c.dueno_comercial_id
  where similarity(c.empresa, p_nombre) > p_umbral
  order by similitud desc
  limit 5;
$$ language sql stable security definer set search_path = public;

revoke all on function buscar_clientes_similares(text, real) from public;
grant execute on function buscar_clientes_similares(text, real) to authenticated;
