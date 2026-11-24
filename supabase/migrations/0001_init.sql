-- ============================================================================
-- CRM Rhinoboots — esquema inicial
-- Cómo usarlo: copia todo este archivo y pégalo en el Editor SQL de Supabase
-- (panel izquierdo → "SQL Editor" → "New query"), luego clic en "Run".
-- Se puede ejecutar varias veces sin romper nada (usa "if not exists").
-- ============================================================================

-- Extensión para poder buscar nombres de empresa "parecidos" (detección de duplicados)
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Función genérica: actualiza "updated_at" cada vez que se edita una fila
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- VENDEDORES (dueños comerciales)
-- ----------------------------------------------------------------------------
create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into vendedores (nombre)
select 'Sin asignar'
where not exists (select 1 from vendedores where nombre = 'Sin asignar');

-- ----------------------------------------------------------------------------
-- CLIENTES
-- ----------------------------------------------------------------------------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  contacto text,
  telefono text,
  ciudad text,
  estado text,
  rfc text,
  tipo_cliente text not null default 'Nuevo'
    check (tipo_cliente in ('Nuevo', 'Cartera')),
  cuenta_clave text,
  dueno_comercial_id uuid references vendedores(id),
  nivel_cuenta text not null default 'Estándar'
    check (nivel_cuenta in ('Estratégica', 'Crecimiento', 'Estándar')),
  id_externo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_empresa_trgm_idx
  on clientes using gin (empresa gin_trgm_ops);
create index if not exists clientes_ciudad_idx on clientes (ciudad);
create index if not exists clientes_dueno_idx on clientes (dueno_comercial_id);

drop trigger if exists clientes_set_updated_at on clientes;
create trigger clientes_set_updated_at
  before update on clientes
  for each row execute function set_updated_at();

-- Función para buscar clientes con nombre parecido (detección de duplicados)
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
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- OPORTUNIDADES (las 3 pipelines viven en la misma tabla, con columnas
-- extra opcionales para los datos propios de licitaciones y recuperación)
-- ----------------------------------------------------------------------------
create table if not exists oportunidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  pipeline text not null check (pipeline in ('ventas', 'licitaciones', 'recuperacion')),
  etapa text not null,
  estado_cierre text not null default 'abierta'
    check (estado_cierre in ('abierta', 'ganada', 'perdida')),
  motivo_perdida text
    check (motivo_perdida in ('precio', 'servicio', 'cambio_proveedor', 'sin_presupuesto', 'sin_respuesta', 'otro')),
  motivo_perdida_detalle text,
  fecha_cierre timestamptz,
  dueno_comercial_id uuid references vendedores(id),
  valor_estimado numeric,
  notas text,

  -- Campos específicos de Licitaciones
  entidad_convocante text,
  fecha_limite_entrega date,
  monto_estimado numeric,
  monto_garantia numeric,
  bid_alineacion boolean,
  bid_capacidad boolean,
  bid_rentabilidad boolean,
  bid_probabilidad boolean,

  -- Campos específicos de Recuperación de cartera
  motivo_perdida_original text
    check (motivo_perdida_original in ('precio', 'servicio', 'cambio_proveedor', 'sin_presupuesto', 'sin_respuesta', 'otro')),
  fecha_ultima_compra date,
  facturacion_historica numeric,
  diagnostico text,
  prioridad_recuperacion text check (prioridad_recuperacion in ('Alta', 'Media', 'Baja')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oportunidades_cliente_idx on oportunidades (cliente_id);
create index if not exists oportunidades_pipeline_idx on oportunidades (pipeline, etapa);
create index if not exists oportunidades_dueno_idx on oportunidades (dueno_comercial_id);

drop trigger if exists oportunidades_set_updated_at on oportunidades;
create trigger oportunidades_set_updated_at
  before update on oportunidades
  for each row execute function set_updated_at();

-- Calcula automáticamente "Prioridad de recuperación" combinando
-- facturación histórica y qué tan reciente fue la última compra.
-- (Los montos son ejemplos razonables en pesos; se pueden ajustar después.)
create or replace function calcular_prioridad_recuperacion()
returns trigger as $$
declare
  puntos_facturacion int := 0;
  puntos_recencia int := 0;
  dias_desde_perdida int;
begin
  if new.pipeline = 'recuperacion' then
    if new.facturacion_historica is not null then
      if new.facturacion_historica >= 500000 then
        puntos_facturacion := 2;
      elsif new.facturacion_historica >= 100000 then
        puntos_facturacion := 1;
      end if;
    end if;

    if new.fecha_ultima_compra is not null then
      dias_desde_perdida := current_date - new.fecha_ultima_compra;
      if dias_desde_perdida <= 180 then
        puntos_recencia := 2;
      elsif dias_desde_perdida <= 540 then
        puntos_recencia := 1;
      end if;
    end if;

    if (puntos_facturacion + puntos_recencia) >= 3 then
      new.prioridad_recuperacion := 'Alta';
    elsif (puntos_facturacion + puntos_recencia) >= 1 then
      new.prioridad_recuperacion := 'Media';
    else
      new.prioridad_recuperacion := 'Baja';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists oportunidades_prioridad on oportunidades;
create trigger oportunidades_prioridad
  before insert or update on oportunidades
  for each row execute function calcular_prioridad_recuperacion();

-- ----------------------------------------------------------------------------
-- HISTORIAL DE ETAPAS — nunca se borra, queda como bitácora permanente
-- ----------------------------------------------------------------------------
create table if not exists oportunidad_historial (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades(id) on delete cascade,
  etapa_anterior text,
  etapa_nueva text not null,
  nota text,
  fecha timestamptz not null default now()
);

create index if not exists historial_oportunidad_idx on oportunidad_historial (oportunidad_id, fecha);

-- Registra automáticamente en el historial cada vez que cambia la etapa
create or replace function registrar_historial_etapa()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into oportunidad_historial (oportunidad_id, etapa_anterior, etapa_nueva)
    values (new.id, null, new.etapa);
  elsif tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then
    insert into oportunidad_historial (oportunidad_id, etapa_anterior, etapa_nueva)
    values (new.id, old.etapa, new.etapa);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists oportunidades_historial on oportunidades;
create trigger oportunidades_historial
  after insert or update on oportunidades
  for each row execute function registrar_historial_etapa();

-- ============================================================================
-- Nota de seguridad: por ahora estas tablas NO tienen "Row Level Security"
-- (RLS) activado, es decir, cualquiera con la llave pública del proyecto
-- podría leer/escribir directamente por la API si conociera la URL.
-- Es aceptable mientras el CRM no tenga un sistema de usuarios con inicio
-- de sesión. Cuando agreguemos login, hay que activar RLS con políticas
-- que solo dejen ver/editar a usuarios autenticados.
-- ============================================================================
