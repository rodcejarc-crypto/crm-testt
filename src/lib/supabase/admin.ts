import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente "administrador" de Supabase. Usa la llave secreta (service_role),
 * que puede saltarse todas las reglas de seguridad — por eso este archivo
 * tiene "server-only": si algún componente de navegador intentara
 * importarlo por error, el proyecto no compila, en lugar de exponer la
 * llave secreta en el navegador.
 *
 * Solo se debe usar dentro de Server Actions (archivos con "use server").
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
