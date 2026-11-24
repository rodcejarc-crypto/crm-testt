import { createClient } from "@/lib/supabase/client";
import type { GrupoCliente } from "@/lib/types";

export async function buscarGrupos(texto: string): Promise<GrupoCliente[]> {
  const supabase = createClient();
  let q = supabase.from("grupos_clientes").select("id, nombre").order("nombre").limit(15);
  const t = texto.trim();
  if (t) q = q.ilike("nombre", `%${t}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GrupoCliente[];
}

export async function obtenerGrupo(id: string): Promise<GrupoCliente | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("grupos_clientes")
    .select("id, nombre")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as GrupoCliente | null;
}

/** Miembros que ESTA cuenta puede ver (RLS de clientes) + total real del grupo. */
export async function miembrosDelGrupo(grupoId: string) {
  const supabase = createClient();
  const [visibles, total] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, empresa, rfc, ciudad")
      .eq("grupo_id", grupoId)
      .order("empresa"),
    supabase.rpc("resumen_grupo", { p_grupo: grupoId }),
  ]);
  if (visibles.error) throw visibles.error;
  if (total.error) throw total.error;
  return {
    visibles: (visibles.data ?? []) as {
      id: string;
      empresa: string;
      rfc: string | null;
      ciudad: string | null;
    }[],
    total: (total.data as number) ?? 0,
  };
}

/** Crea el grupo (o reutiliza uno con el mismo nombre) y devuelve el grupo. */
export async function crearGrupo(nombre: string, creadoPor: string | null): Promise<GrupoCliente> {
  const supabase = createClient();
  const limpio = nombre.trim();
  const existente = await supabase
    .from("grupos_clientes")
    .select("id, nombre")
    .ilike("nombre", limpio)
    .maybeSingle();
  if (existente.data) return existente.data as GrupoCliente;
  const { data, error } = await supabase
    .from("grupos_clientes")
    .insert({ nombre: limpio, creado_por: creadoPor })
    .select("id, nombre")
    .single();
  if (error) throw error;
  return data as GrupoCliente;
}

export async function asignarGrupo(clienteId: string, grupoId: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("clientes").update({ grupo_id: grupoId }).eq("id", clienteId);
  if (error) throw error;
}
