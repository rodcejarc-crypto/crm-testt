import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para usarse en el navegador (componentes "client").
 * Lee la URL y la llave pública desde las variables de entorno.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
