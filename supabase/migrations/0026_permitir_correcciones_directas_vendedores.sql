-- ============================================================================
-- CRM Rhinoboots — ajusta el disparador de 0025 que bloquea cambios de rol
-- o unidad_negocio en "vendedores".
--
-- El objetivo de ese disparador es impedir que alguien lo haga DESDE LA APP
-- con una sesión que no sea de administrador general (p. ej. Pedro,
-- admin_unidad, intentando cambiarse de sucursal). Pero tal como quedó
-- escrito también bloqueaba correcciones directas hechas en el SQL Editor o
-- por la CLI de Supabase (con el token de acceso del proyecto) — ahí no hay
-- sesión de usuario (auth.uid() es null), así que es_admin() siempre daba
-- falso y la corrección se rechazaba aunque la hiciera la propia dueña del
-- proyecto.
--
-- Ahora se permite también cuando auth.uid() es null (acceso directo con
-- las credenciales del proyecto, no de la app). La protección real —que
-- ninguna sesión de la app que no sea admin general pueda hacerlo— sigue
-- intacta: un usuario con sesión iniciada SIEMPRE tiene auth.uid() distinto
-- de null.
-- ============================================================================
create or replace function trg_bloquear_cambio_rol_o_unidad()
returns trigger as $$
begin
  if auth.uid() is not null and not es_admin() and (
    new.rol is distinct from old.rol or new.unidad_negocio is distinct from old.unidad_negocio
  ) then
    raise exception 'Solo un administrador general puede cambiar el rol o la unidad de negocio de un vendedor.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
