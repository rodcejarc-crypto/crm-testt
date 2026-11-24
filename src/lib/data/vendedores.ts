import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vendedor } from "@/lib/types";

/** Solo la administración general puede cambiarlo (la base de datos lo exige). */
export async function actualizarHaceVisitasCampo(id: string, valor: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vendedores")
    .update({ hace_visitas_campo: valor })
    .eq("id", id);
  if (error) throw error;
}

/** Meta de llamadas de cartera por día (null = fuera del programa). Solo la administración general. */
export async function actualizarMetaLlamadas(id: string, valor: number | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vendedores")
    .update({ meta_llamadas_diarias: valor })
    .eq("id", id);
  if (error) throw error;
}

export async function listarVendedores(clienteExterno?: SupabaseClient): Promise<Vendedor[]> {
  const supabase = clienteExterno ?? createClient();
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data as Vendedor[];
}

/**
 * Devuelve el registro de "vendedores" que corresponde a la persona que
 * inició sesión ahora mismo (o null si no está autenticada / no tiene
 * ficha de vendedor todavía).
 */
export async function obtenerVendedorActual(): Promise<Vendedor | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as Vendedor | null;
}
