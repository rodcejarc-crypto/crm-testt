import { createClient } from "@/lib/supabase/client";
import { LINEA_FLETE, LINEA_PLANTILLAS } from "@/lib/types";
import type { LineaPedido, OportunidadPartida } from "@/lib/types";

export async function listarPartidas(oportunidadId: string): Promise<OportunidadPartida[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("oportunidad_partidas")
    .select("*")
    .eq("oportunidad_id", oportunidadId)
    .order("orden");
  if (error) throw error;
  return (data ?? []) as OportunidadPartida[];
}

export interface FilaPartida {
  estilo: string;
  linea: LineaPedido | null;
  pares: number;
  /** null = se embarcó todo el renglón. */
  pares_embarcados: number | null;
  precio_unitario: number;
}

/** Reemplaza todas las partidas de la oportunidad (la base de datos recalcula los totales sola). */
export async function reemplazarPartidas(oportunidadId: string, filas: FilaPartida[]): Promise<void> {
  const supabase = createClient();
  const { error: errDel } = await supabase
    .from("oportunidad_partidas")
    .delete()
    .eq("oportunidad_id", oportunidadId);
  if (errDel) throw errDel;
  if (filas.length === 0) return;
  const { error } = await supabase
    .from("oportunidad_partidas")
    .insert(filas.map((f, i) => ({ ...f, oportunidad_id: oportunidadId, orden: i })));
  if (error) throw error;
}

export interface ResumenPartidas {
  n: number;
  /** Pares de CALZADO realmente embarcados (no incluye plantillas ni flete). */
  pares: number;
  /** Pares de calzado del pedido completo. */
  paresPedido: number;
  /** Cargo por flete. */
  flete: number;
  /** Total embarcado en dinero (lo que cuenta en Ventas). */
  montoEmbarcado: number;
  /** Cantidad de plantillas. */
  plantillas: number;
  /** Total del pedido en dinero (calzado + plantillas). */
  monto: number;
  sinLinea: number;
}

export async function resumenPartidas(oportunidadId: string): Promise<ResumenPartidas> {
  const ps = await listarPartidas(oportunidadId);
  const calzado = ps.filter((p) => p.linea !== LINEA_PLANTILLAS && p.linea !== LINEA_FLETE);
  return {
    n: ps.length,
    pares: calzado.reduce((s, p) => s + Number(p.pares_embarcados ?? p.pares), 0),
    paresPedido: calzado.reduce((s, p) => s + Number(p.pares), 0),
    flete: ps.filter((p) => p.linea === LINEA_FLETE).reduce((s, p) => s + Number(p.monto), 0),
    montoEmbarcado: ps.reduce((s, p) => s + Number(p.monto_embarcado), 0),
    plantillas: ps.filter((p) => p.linea === LINEA_PLANTILLAS).reduce((s, p) => s + Number(p.pares), 0),
    monto: ps.reduce((s, p) => s + Number(p.monto), 0),
    sinLinea: ps.filter((p) => !p.linea).length,
  };
}
