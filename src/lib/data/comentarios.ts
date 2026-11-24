import { createClient } from "@/lib/supabase/client";
import type { Comentario } from "@/lib/types";

export async function listarComentarios(oportunidadId: string): Promise<Comentario[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comentarios")
    .select("*, autor:vendedores(id, nombre, rol)")
    .eq("oportunidad_id", oportunidadId)
    .order("creado_en", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Comentario[];
}

export async function crearComentario(datos: {
  oportunidad_id: string;
  seguimiento_id: string | null;
  autor_id: string;
  texto: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("comentarios").insert({
    oportunidad_id: datos.oportunidad_id,
    seguimiento_id: datos.seguimiento_id,
    autor_id: datos.autor_id,
    texto: datos.texto.trim(),
  });
  if (error) throw error;
}

/** Solo funciona para el autor y dentro de los primeros 5 minutos (lo exige la base de datos). */
export async function borrarComentario(id: string): Promise<void> {
  const supabase = createClient();
  const { error, count } = await supabase
    .from("comentarios")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (!count) throw new Error("Ya pasaron los 5 minutos: este comentario ya no se puede borrar.");
}

/** Marca como leídos los comentarios de esta oportunidad (solo surte efecto si eres su dueño). */
export async function marcarComentariosLeidos(oportunidadId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("marcar_comentarios_leidos", {
    p_oportunidad: oportunidadId,
  });
  if (error) throw error;
}

export interface ComentarioSinLeer {
  oportunidad_id: string;
  seguimiento_id: string | null;
}

/** Comentarios nuevos para quien inició sesión (de sus propias oportunidades). */
export async function comentariosSinLeer(): Promise<ComentarioSinLeer[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("mis_comentarios_sin_leer");
  if (error) throw error;
  return (data ?? []) as ComentarioSinLeer[];
}
