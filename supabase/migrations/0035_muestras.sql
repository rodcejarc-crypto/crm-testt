-- ============================================================================
-- CRM Rhinoboots — Solicitud de muestras: el vendedor solicita desde una
-- oportunidad, un Administrador aprueba o rechaza, el vendedor registra la
-- entrega (y programa sus seguimientos de prueba), evalúa al final y, si el
-- cliente aprueba, pasa la oportunidad a cotización.
--
-- Todo lo que cambia el estado de una muestra pasa por funciones de esta
-- migración (que revisan permisos); las tablas solo se pueden LEER por RLS.
-- ============================================================================

-- Quien puede ver la oportunidad (admin, su dueño, o admin de esa unidad).
create or replace function puede_ver_oportunidad(p_op uuid)
returns boolean as $$
  select exists (
    select 1 from oportunidades o
    where o.id = p_op
      and (
        es_admin() or o.dueno_comercial_id = mi_vendedor_id()
        or o.dueno_comercial_id in (select vendedores_de_mi_unidad())
      )
  );
$$ language sql stable security definer set search_path = public;

create table if not exists muestras (
  id uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  vendedor_id uuid references vendedores(id) on delete set null,
  creado_en timestamptz not null default now(),
  estado text not null default 'solicitada'
    check (estado in ('solicitada','aprobada','rechazada','entregada','en_prueba','evaluada','cerrada')),

  -- Solicitud
  ficha_cliente jsonb not null default '{}'::jsonb,
  justificacion_necesidad text,
  justificacion_modelos text,
  prueba_valor int check (prueba_valor is null or prueba_valor > 0),
  prueba_unidad text check (prueba_unidad is null or prueba_unidad in ('dias','semanas','meses')),

  -- Aprobación
  aprobado_por uuid references vendedores(id) on delete set null,
  fecha_aprobacion timestamptz,
  motivo_rechazo text,

  -- Entrega y prueba
  fecha_entrega date,
  forma_entrega text check (forma_entrega is null or forma_entrega in ('en_persona','paqueteria','cliente_recoge')),
  recibio text,
  evaluador_nombre text,
  evaluador_contacto text,
  fecha_fin_prueba date,
  ultimo_resultado_prueba text
    check (ultimo_resultado_prueba is null or ultimo_resultado_prueba in ('va_bien','observaciones','rechazada','sin_respuesta')),

  -- Evaluación y cierre
  devolucion text check (devolucion is null or devolucion in ('se_devuelve','se_queda_sin_costo','se_cobra')),
  resultado text check (resultado is null or resultado in ('aprobada_cliente','rechazada','sin_respuesta')),
  motivo_resultado text,
  comentarios_usuario text,
  comentario_cierre text,
  evaluada_en timestamptz,
  cerrada_en timestamptz
);
create index if not exists muestras_oportunidad_idx on muestras (oportunidad_id);
create index if not exists muestras_estado_idx on muestras (estado);
create index if not exists muestras_vendedor_idx on muestras (vendedor_id);

create table if not exists muestras_renglones (
  id uuid primary key default gen_random_uuid(),
  muestra_id uuid not null references muestras(id) on delete cascade,
  estilo text not null,
  linea text not null check (linea in ('Calzado de Piel','PVC','Calzado Económico','Plantillas')),
  talla text,
  pares int not null check (pares > 0),
  pares_solicitados int not null check (pares_solicitados > 0),
  orden int not null default 0
);
create index if not exists muestras_renglones_idx on muestras_renglones (muestra_id, orden);

create table if not exists muestra_historial (
  id uuid primary key default gen_random_uuid(),
  muestra_id uuid not null references muestras(id) on delete cascade,
  tipo text not null,
  descripcion text,
  motivo text,
  por uuid references vendedores(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists muestra_historial_idx on muestra_historial (muestra_id, creado_en);

-- Los seguimientos de prueba son tareas de la oportunidad, ligadas a la muestra.
alter table tareas add column if not exists muestra_id uuid references muestras(id) on delete cascade;
alter table tareas add column if not exists muestra_rol text
  check (muestra_rol is null or muestra_rol in ('recepcion','revision','final','extra'));
alter table tareas add column if not exists resultado_prueba text
  check (resultado_prueba is null or resultado_prueba in ('va_bien','observaciones','rechazada','sin_respuesta'));
alter table tareas add column if not exists detalle text;
create index if not exists tareas_muestra_idx on tareas (muestra_id);

alter table muestras enable row level security;
alter table muestras_renglones enable row level security;
alter table muestra_historial enable row level security;

drop policy if exists "muestras_select" on muestras;
create policy "muestras_select" on muestras for select to authenticated
  using (puede_ver_oportunidad(oportunidad_id));

drop policy if exists "muestras_renglones_select" on muestras_renglones;
create policy "muestras_renglones_select" on muestras_renglones for select to authenticated
  using (exists (select 1 from muestras m where m.id = muestras_renglones.muestra_id and puede_ver_oportunidad(m.oportunidad_id)));

drop policy if exists "muestra_historial_select" on muestra_historial;
create policy "muestra_historial_select" on muestra_historial for select to authenticated
  using (exists (select 1 from muestras m where m.id = muestra_historial.muestra_id and puede_ver_oportunidad(m.oportunidad_id)));

-- ---------------------------------------------------------------- utilidades
create or replace function fecha_fin_muestra(p_fecha date, p_valor int, p_unidad text)
returns date as $$
  select case p_unidad
    when 'dias' then p_fecha + p_valor
    when 'semanas' then p_fecha + (p_valor * 7)
    when 'meses' then (p_fecha + (p_valor || ' months')::interval)::date
  end;
$$ language sql immutable;

create or replace function tipo_tarea_oportunidad(p_op uuid)
returns text as $$
  select case pipeline
    when 'recuperacion' then 'seguimiento_recuperacion'
    when 'licitaciones' then 'seguimiento_licitacion'
    else 'seguimiento_venta'
  end from oportunidades where id = p_op;
$$ language sql stable security definer set search_path = public;

-- Inserta los seguimientos de una muestra a partir de un arreglo JSON
-- [{nombre, fecha, hora, detalle, rol}]. Siempre deja UNA evaluación final
-- en la fecha fin de prueba (no se puede quitar).
create or replace function crear_seguimientos_muestra(p_muestra uuid, p_items jsonb)
returns void as $$
declare
  m muestras%rowtype;
  o oportunidades%rowtype;
  it jsonb;
  v_hay_final boolean := false;
begin
  select * into m from muestras where id = p_muestra;
  select * into o from oportunidades where id = m.oportunidad_id;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (it->>'rol') = 'final' then
      if v_hay_final then continue; end if;
      v_hay_final := true;
      insert into tareas (tipo, titulo, fecha_vencimiento, hora_vencimiento, detalle, oportunidad_id,
                          dueno_comercial_id, muestra_id, muestra_rol)
      values (tipo_tarea_oportunidad(o.id), 'Muestras — ' || coalesce(nullif(trim(it->>'nombre'), ''), 'Evaluación final'),
              m.fecha_fin_prueba, nullif(it->>'hora', '')::time, nullif(trim(it->>'detalle'), ''),
              o.id, o.dueno_comercial_id, m.id, 'final');
    else
      insert into tareas (tipo, titulo, fecha_vencimiento, hora_vencimiento, detalle, oportunidad_id,
                          dueno_comercial_id, muestra_id, muestra_rol)
      values (tipo_tarea_oportunidad(o.id), 'Muestras — ' || coalesce(nullif(trim(it->>'nombre'), ''), 'Seguimiento'),
              (it->>'fecha')::date, nullif(it->>'hora', '')::time, nullif(trim(it->>'detalle'), ''),
              o.id, o.dueno_comercial_id, m.id,
              case when (it->>'rol') in ('recepcion','revision') then it->>'rol' else 'extra' end);
    end if;
  end loop;

  if not v_hay_final then
    insert into tareas (tipo, titulo, fecha_vencimiento, oportunidad_id, dueno_comercial_id, muestra_id, muestra_rol)
    values (tipo_tarea_oportunidad(o.id), 'Muestras — Evaluación final', m.fecha_fin_prueba,
            o.id, o.dueno_comercial_id, m.id, 'final');
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------- solicitud
create or replace function crear_solicitud_muestra(
  p_oportunidad uuid, p_ficha jsonb, p_just_necesidad text, p_just_modelos text,
  p_prueba_valor int, p_prueba_unidad text, p_renglones jsonb
) returns uuid as $$
declare
  o oportunidades%rowtype;
  v_id uuid;
  r jsonb;
  i int := 0;
begin
  if not puede_ver_oportunidad(p_oportunidad) then
    raise exception 'No tienes permiso sobre esta oportunidad.';
  end if;
  select * into o from oportunidades where id = p_oportunidad;
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Agrega al menos un renglón (estilo, talla y cantidad).';
  end if;
  if coalesce(trim(p_just_necesidad), '') = '' or coalesce(trim(p_just_modelos), '') = '' then
    raise exception 'La justificación de las muestras es obligatoria.';
  end if;
  if p_prueba_valor is null or p_prueba_valor <= 0 or p_prueba_unidad not in ('dias','semanas','meses') then
    raise exception 'Indica los días de prueba propuestos.';
  end if;

  insert into muestras (oportunidad_id, cliente_id, vendedor_id, ficha_cliente, justificacion_necesidad,
                        justificacion_modelos, prueba_valor, prueba_unidad)
  values (o.id, o.cliente_id, o.dueno_comercial_id, coalesce(p_ficha, '{}'::jsonb), trim(p_just_necesidad),
          trim(p_just_modelos), p_prueba_valor, p_prueba_unidad)
  returning id into v_id;

  for r in select * from jsonb_array_elements(p_renglones) loop
    i := i + 1;
    insert into muestras_renglones (muestra_id, estilo, linea, talla, pares, pares_solicitados, orden)
    values (v_id, trim(r->>'estilo'), r->>'linea', nullif(trim(r->>'talla'), ''),
            (r->>'pares')::int, (r->>'pares')::int, i);
  end loop;

  insert into muestra_historial (muestra_id, tipo, descripcion, por)
  values (v_id, 'solicitud', 'Solicitud de muestras creada', mi_vendedor_id());
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------- aprobación
create or replace function aprobar_muestra(p_muestra uuid, p_renglones jsonb)
returns void as $$
declare
  m muestras%rowtype;
  r jsonb;
begin
  if not es_admin() then
    raise exception 'Solo un Administrador puede aprobar muestras.';
  end if;
  select * into m from muestras where id = p_muestra;
  if not found or m.estado <> 'solicitada' then
    raise exception 'Esta solicitud ya no está pendiente de aprobación.';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) loop
    if (r->>'pares')::int <= 0 then
      raise exception 'La cantidad aprobada debe ser mayor a cero.';
    end if;
    update muestras_renglones set pares = (r->>'pares')::int
     where id = (r->>'id')::uuid and muestra_id = p_muestra;
  end loop;

  update muestras set estado = 'aprobada', aprobado_por = mi_vendedor_id(), fecha_aprobacion = now()
   where id = p_muestra;
  insert into muestra_historial (muestra_id, tipo, descripcion, por)
  values (p_muestra, 'aprobacion', 'Solicitud aprobada', mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function rechazar_muestra(p_muestra uuid, p_motivo text)
returns void as $$
declare
  m muestras%rowtype;
begin
  if not es_admin() then
    raise exception 'Solo un Administrador puede rechazar muestras.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo del rechazo.';
  end if;
  select * into m from muestras where id = p_muestra;
  if not found or m.estado <> 'solicitada' then
    raise exception 'Esta solicitud ya no está pendiente de aprobación.';
  end if;
  update muestras set estado = 'rechazada', aprobado_por = mi_vendedor_id(),
         fecha_aprobacion = now(), motivo_rechazo = trim(p_motivo)
   where id = p_muestra;
  insert into muestra_historial (muestra_id, tipo, descripcion, motivo, por)
  values (p_muestra, 'rechazo', 'Solicitud rechazada', trim(p_motivo), mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------- entrega
create or replace function registrar_entrega_muestra(
  p_muestra uuid, p_fecha date, p_forma text, p_recibio text, p_valor int, p_unidad text,
  p_eval_nombre text, p_eval_contacto text, p_seguimientos jsonb
) returns void as $$
declare
  m muestras%rowtype;
  v_fin date;
begin
  select * into m from muestras where id = p_muestra;
  if not found or not puede_ver_oportunidad(m.oportunidad_id) then
    raise exception 'No tienes permiso sobre esta muestra.';
  end if;
  if m.estado <> 'aprobada' then
    raise exception 'Solo se puede registrar la entrega de una muestra aprobada.';
  end if;
  if p_fecha is null or p_forma not in ('en_persona','paqueteria','cliente_recoge')
     or coalesce(trim(p_recibio), '') = '' or coalesce(trim(p_eval_nombre), '') = ''
     or p_valor is null or p_valor <= 0 or p_unidad not in ('dias','semanas','meses') then
    raise exception 'Completa fecha, forma de entrega, quién recibió, duración de la prueba y quién evalúa.';
  end if;

  v_fin := fecha_fin_muestra(p_fecha, p_valor, p_unidad);
  update muestras set
    estado = 'en_prueba', fecha_entrega = p_fecha, forma_entrega = p_forma, recibio = trim(p_recibio),
    prueba_valor = p_valor, prueba_unidad = p_unidad, fecha_fin_prueba = v_fin,
    evaluador_nombre = trim(p_eval_nombre), evaluador_contacto = nullif(trim(p_eval_contacto), '')
  where id = p_muestra;

  perform crear_seguimientos_muestra(p_muestra, p_seguimientos);
  insert into muestra_historial (muestra_id, tipo, descripcion, por)
  values (p_muestra, 'entrega',
          'Entrega registrada. Prueba de ' || p_valor || ' ' || p_unidad || ' (fin: ' || v_fin || ')', mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

-- Extender o acortar la prueba (motivo obligatorio, queda en el historial).
create or replace function modificar_prueba_muestra(
  p_muestra uuid, p_valor int, p_unidad text, p_motivo text, p_nuevo jsonb
) returns void as $$
declare
  m muestras%rowtype;
  v_fin date;
  n int;
begin
  select * into m from muestras where id = p_muestra;
  if not found or not puede_ver_oportunidad(m.oportunidad_id) then
    raise exception 'No tienes permiso sobre esta muestra.';
  end if;
  if m.estado <> 'en_prueba' then
    raise exception 'Solo se puede modificar una prueba que está en curso.';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Escribe el motivo del cambio.';
  end if;
  if p_valor is null or p_valor <= 0 or p_unidad not in ('dias','semanas','meses') then
    raise exception 'Indica la nueva duración.';
  end if;

  v_fin := fecha_fin_muestra(m.fecha_entrega, p_valor, p_unidad);
  update muestras set prueba_valor = p_valor, prueba_unidad = p_unidad, fecha_fin_prueba = v_fin
   where id = p_muestra;

  update tareas set fecha_vencimiento = v_fin
   where muestra_id = p_muestra and muestra_rol = 'final' and estado = 'pendiente';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'La evaluación final ya se registró.';
  end if;

  if p_nuevo is not null and jsonb_typeof(p_nuevo) = 'object' and (p_nuevo->>'fecha') is not null then
    insert into tareas (tipo, titulo, fecha_vencimiento, hora_vencimiento, detalle, oportunidad_id,
                        dueno_comercial_id, muestra_id, muestra_rol)
    select tipo_tarea_oportunidad(o.id),
           'Muestras — ' || coalesce(nullif(trim(p_nuevo->>'nombre'), ''), 'Revisión intermedia'),
           (p_nuevo->>'fecha')::date, nullif(p_nuevo->>'hora', '')::time, nullif(trim(p_nuevo->>'detalle'), ''),
           o.id, o.dueno_comercial_id, m.id, 'extra'
    from oportunidades o where o.id = m.oportunidad_id;
  end if;

  insert into muestra_historial (muestra_id, tipo, descripcion, motivo, por)
  values (p_muestra, 'modificacion_prueba',
          'Prueba: ' || m.prueba_valor || ' ' || m.prueba_unidad || ' (fin ' || m.fecha_fin_prueba || ') → '
          || p_valor || ' ' || p_unidad || ' (fin ' || v_fin || ')',
          trim(p_motivo), mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

-- El cliente rechazó la prueba: se salta directo a la evaluación final.
create or replace function pasar_a_evaluacion_final(p_muestra uuid, p_motivo text)
returns void as $$
declare
  m muestras%rowtype;
begin
  select * into m from muestras where id = p_muestra;
  if not found or not puede_ver_oportunidad(m.oportunidad_id) then
    raise exception 'No tienes permiso sobre esta muestra.';
  end if;
  if m.estado <> 'en_prueba' then
    raise exception 'La prueba no está en curso.';
  end if;
  update tareas set estado = 'cancelada'
   where muestra_id = p_muestra and estado = 'pendiente' and muestra_rol <> 'final';
  update tareas set fecha_vencimiento = current_date
   where muestra_id = p_muestra and muestra_rol = 'final' and estado = 'pendiente';
  update muestras set fecha_fin_prueba = current_date where id = p_muestra;
  insert into muestra_historial (muestra_id, tipo, descripcion, motivo, por)
  values (p_muestra, 'modificacion_prueba', 'Se adelantó la evaluación final (fin ' || m.fecha_fin_prueba || ' → hoy)',
          coalesce(nullif(trim(p_motivo), ''), 'El cliente rechazó la muestra'), mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------- evaluación
create or replace function evaluar_muestra(
  p_muestra uuid, p_resultado text, p_comentarios text, p_motivo text, p_devolucion text
) returns void as $$
declare
  m muestras%rowtype;
begin
  select * into m from muestras where id = p_muestra;
  if not found or not puede_ver_oportunidad(m.oportunidad_id) then
    raise exception 'No tienes permiso sobre esta muestra.';
  end if;
  if m.estado <> 'en_prueba' then
    raise exception 'Esta muestra no está en prueba.';
  end if;
  if p_resultado not in ('aprobada_cliente','rechazada','sin_respuesta') then
    raise exception 'Elige el resultado de la prueba.';
  end if;
  if p_resultado = 'rechazada' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Elige el motivo por el que el cliente rechazó la muestra.';
  end if;
  if p_devolucion not in ('se_devuelve','se_queda_sin_costo','se_cobra') then
    raise exception 'Indica qué pasa con las muestras (devueltas, se quedan o se cobran).';
  end if;

  update muestras set estado = 'evaluada', resultado = p_resultado, comentarios_usuario = nullif(trim(p_comentarios), ''),
         motivo_resultado = nullif(trim(p_motivo), ''), devolucion = p_devolucion, evaluada_en = now()
   where id = p_muestra;

  update tareas set estado = 'completada', completada_at = now(),
         nota = 'Evaluación final: ' || case p_resultado when 'aprobada_cliente' then 'aprobada por el cliente'
                  when 'rechazada' then 'rechazada' else 'sin respuesta' end
                || coalesce('. ' || nullif(trim(p_comentarios), ''), '')
   where muestra_id = p_muestra and muestra_rol = 'final' and estado = 'pendiente';
  update tareas set estado = 'cancelada' where muestra_id = p_muestra and estado = 'pendiente';

  insert into muestra_historial (muestra_id, tipo, descripcion, motivo, por)
  values (p_muestra, 'evaluacion', 'Evaluación final: ' || p_resultado, nullif(trim(p_motivo), ''), mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function cerrar_muestra(p_muestra uuid, p_comentario text)
returns void as $$
declare
  m muestras%rowtype;
begin
  select * into m from muestras where id = p_muestra;
  if not found or not puede_ver_oportunidad(m.oportunidad_id) then
    raise exception 'No tienes permiso sobre esta muestra.';
  end if;
  if m.estado <> 'evaluada' then
    raise exception 'Primero hay que registrar la evaluación final.';
  end if;
  update muestras set estado = 'cerrada', comentario_cierre = nullif(trim(p_comentario), ''), cerrada_en = now()
   where id = p_muestra;
  insert into muestra_historial (muestra_id, tipo, descripcion, motivo, por)
  values (p_muestra, 'cierre', 'Muestra cerrada', nullif(trim(p_comentario), ''), mi_vendedor_id());
end;
$$ language plpgsql security definer set search_path = public;

-- Al completar un seguimiento de prueba se guarda el último estado reportado.
create or replace function trg_tareas_resultado_prueba()
returns trigger as $$
begin
  if new.muestra_id is not null and new.estado = 'completada' and old.estado is distinct from 'completada'
     and new.resultado_prueba is not null then
    update muestras set ultimo_resultado_prueba = new.resultado_prueba where id = new.muestra_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists tareas_resultado_prueba on tareas;
create trigger tareas_resultado_prueba
  after update on tareas
  for each row execute function trg_tareas_resultado_prueba();

-- ---------------------------------------------------------------- permisos
do $$
declare f text;
begin
  foreach f in array array[
    'crear_solicitud_muestra(uuid,jsonb,text,text,int,text,jsonb)',
    'aprobar_muestra(uuid,jsonb)', 'rechazar_muestra(uuid,text)',
    'registrar_entrega_muestra(uuid,date,text,text,int,text,text,text,jsonb)',
    'modificar_prueba_muestra(uuid,int,text,text,jsonb)', 'pasar_a_evaluacion_final(uuid,text)',
    'evaluar_muestra(uuid,text,text,text,text)', 'cerrar_muestra(uuid,text)'
  ] loop
    execute 'revoke all on function ' || f || ' from public';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end $$;

-- ---------------------------------------------------------------- evidencia
insert into storage.buckets (id, name, public)
values ('muestras_evidencia', 'muestras_evidencia', false)
on conflict (id) do nothing;

drop policy if exists "muestras_evidencia_insert" on storage.objects;
create policy "muestras_evidencia_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'muestras_evidencia' and exists (
      select 1 from muestras m
      where m.id::text = (storage.foldername(name))[1] and puede_ver_oportunidad(m.oportunidad_id)
    )
  );

drop policy if exists "muestras_evidencia_select" on storage.objects;
create policy "muestras_evidencia_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'muestras_evidencia' and exists (
      select 1 from muestras m
      where m.id::text = (storage.foldername(name))[1] and puede_ver_oportunidad(m.oportunidad_id)
    )
  );

drop policy if exists "muestras_evidencia_delete" on storage.objects;
create policy "muestras_evidencia_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'muestras_evidencia' and exists (
      select 1 from muestras m
      where m.id::text = (storage.foldername(name))[1] and puede_ver_oportunidad(m.oportunidad_id)
        and m.estado in ('aprobada', 'en_prueba')
    )
  );
