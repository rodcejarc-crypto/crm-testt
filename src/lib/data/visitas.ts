import { createClient } from "@/lib/supabase/client";
import { nombreSeguroArchivo } from "@/lib/nombre-archivo";
import type { EstadoVisita, Visita } from "@/lib/types";

const SELECT_COMPLETO =
  "*, vendedor:vendedores!visitas_vendedor_id_fkey(id, nombre), realizada_para:vendedores!visitas_realizada_para_id_fkey(id, nombre), cliente:clientes(id, empresa), oportunidad:oportunidades(id, pipeline, etapa)";

export interface FiltrosVisitas {
  vendedorId?: string;
  estado?: EstadoVisita;
  desde?: string;
  hasta?: string;
}

export async function listarVisitas(filtros: FiltrosVisitas = {}): Promise<Visita[]> {
  const supabase = createClient();
  let query = supabase.from("visitas").select(SELECT_COMPLETO);

  if (filtros.vendedorId) {
    query = query.or(
      `vendedor_id.eq.${filtros.vendedorId},realizada_para_id.eq.${filtros.vendedorId}`
    );
  }
  if (filtros.estado) query = query.eq("estado", filtros.estado);
  if (filtros.desde) query = query.gte("fecha", filtros.desde);
  if (filtros.hasta) query = query.lte("fecha", filtros.hasta);

  const { data, error } = await query.order("fecha", { ascending: false });
  if (error) throw error;
  return data as unknown as Visita[];
}

/** Visitas ligadas a una oportunidad (las ve cualquiera que pueda ver la oportunidad). */
export async function listarVisitasPorOportunidad(oportunidadId: string): Promise<Visita[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visitas")
    .select(SELECT_COMPLETO)
    .eq("oportunidad_id", oportunidadId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data as unknown as Visita[];
}

export async function crearVisita(datos: {
  fecha: string;
  vendedor_id: string;
  realizada_para_id: string;
  cliente_id: string;
  oportunidad_id: string | null;
  notas?: string;
}): Promise<Visita> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("visitas")
    .insert({ ...datos, estado: "agendada" })
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Visita;
}

/** Liga una visita (p. ej. una vieja sin cliente) a un cliente y, opcionalmente, a una oportunidad. */
export async function ligarVisita(
  id: string,
  clienteId: string,
  oportunidadId: string | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visitas")
    .update({ cliente_id: clienteId, oportunidad_id: oportunidadId })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Marca la visita como realizada. La base de datos exige que tenga evidencia
 * y, si está ligada a una oportunidad, deja un seguimiento hecho en ella.
 */
export async function marcarVisitaRealizada(id: string, notas?: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visitas")
    .update({ estado: "realizada", ...(notas ? { notas } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------- Evidencia

export interface ArchivoEvidencia {
  name: string;
  path: string;
  size: number;
  createdAt: string | null;
}

export async function subirEvidencia(visitaId: string, file: File): Promise<void> {
  const supabase = createClient();
  const path = `${visitaId}/${Date.now()}-${nombreSeguroArchivo(file.name)}`;
  const { error } = await supabase.storage.from("evidencias").upload(path, file);
  if (error) throw error;
}

export async function listarEvidencia(visitaId: string): Promise<ArchivoEvidencia[]> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("evidencias").list(visitaId);
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({
      name: f.name,
      path: `${visitaId}/${f.name}`,
      size: f.metadata?.size ?? 0,
      createdAt: f.created_at ?? null,
    }));
}

export async function urlEvidencia(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("evidencias")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function borrarEvidencia(path: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from("evidencias").remove([path]);
  if (error) throw error;
}
