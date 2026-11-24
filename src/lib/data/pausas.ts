import { createClient } from "@/lib/supabase/client";

export interface PausaLlamadas {
  id: string;
  vendedor_id: string;
  desde: string;
  hasta: string;
  motivo: string;
  creado_en: string;
  cancelada_en: string | null;
  /** Si es false, la pausa además oculta las llamadas pendientes del vendedor. */
  mantener_pendientes: boolean;
  vendedor: { nombre: string } | null;
  creador: { nombre: string } | null;
  cancelador: { nombre: string } | null;
}

export type EstadoPausa = "programada" | "activa" | "terminada" | "cancelada";

/** Hoy como texto AAAA-MM-DD (las pantallas se usan en hora de México). */
export function hoyTexto(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function estadoPausa(p: Pick<PausaLlamadas, "desde" | "hasta" | "cancelada_en">, hoy = hoyTexto()): EstadoPausa {
  if (p.cancelada_en) return "cancelada";
  if (hoy < p.desde) return "programada";
  if (hoy > p.hasta) return "terminada";
  return "activa";
}

export const formatoFecha = (texto: string) =>
  new Date(`${texto}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** Todas las pausas que el usuario puede ver (la administración, todas; el vendedor, las suyas). */
export async function listarPausas(): Promise<PausaLlamadas[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("llamadas_pausas")
    .select(
      "id, vendedor_id, desde, hasta, motivo, creado_en, cancelada_en, mantener_pendientes, " +
        "vendedor:vendedores!llamadas_pausas_vendedor_id_fkey(nombre), " +
        "creador:vendedores!llamadas_pausas_creado_por_fkey(nombre), " +
        "cancelador:vendedores!llamadas_pausas_cancelada_por_fkey(nombre)"
    )
    .order("desde", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PausaLlamadas[];
}

/** Pausa vigente hoy de cada vendedor (por id de vendedor). */
export function pausasActivasPorVendedor(pausas: PausaLlamadas[], hoy = hoyTexto()): Map<string, PausaLlamadas> {
  const m = new Map<string, PausaLlamadas>();
  for (const p of pausas) if (estadoPausa(p, hoy) === "activa") m.set(p.vendedor_id, p);
  return m;
}

export async function pausarLlamadas(
  vendedorId: string,
  desde: string,
  hasta: string,
  motivo: string,
  mantenerPendientes = true
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("pausar_llamadas", {
    p_vendedor: vendedorId,
    p_desde: desde,
    p_hasta: hasta,
    p_motivo: motivo,
    p_mantener_pendientes: mantenerPendientes,
  });
  if (error) throw new Error(error.message);
}

/** Pausa a todos los vendedores con llamadas al día. Devuelve cuántos se pausaron y cuántos ya tenían una pausa en esas fechas. */
export async function pausarLlamadasTodos(
  desde: string,
  hasta: string,
  motivo: string,
  mantenerPendientes = true
): Promise<{ pausados: number; omitidos: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("pausar_llamadas_todos", {
    p_desde: desde,
    p_hasta: hasta,
    p_motivo: motivo,
    p_mantener_pendientes: mantenerPendientes,
  });
  if (error) throw new Error(error.message);
  const fila = (Array.isArray(data) ? data[0] : data) as { pausados: number; omitidos: number } | undefined;
  return { pausados: fila?.pausados ?? 0, omitidos: fila?.omitidos ?? 0 };
}

/** Cuántas llamadas de cartera tiene pendientes un vendedor (la administración las ve todas). */
export async function contarLlamadasPendientes(vendedorId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("tareas")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "llamada_cartera")
    .eq("estado", "pendiente")
    .eq("dueno_comercial_id", vendedorId);
  if (error) throw error;
  return count ?? 0;
}

export async function cancelarPausaLlamadas(pausaId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cancelar_pausa_llamadas", { p_pausa: pausaId });
  if (error) throw new Error(error.message);
}
