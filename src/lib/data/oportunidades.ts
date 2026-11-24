import { createClient } from "@/lib/supabase/client";
import { PIPELINES } from "@/lib/pipelines/config";
import type {
  HistorialEtapa,
  MotivoPerdida,
  Oportunidad,
  PipelineKey,
} from "@/lib/types";

const SELECT_COMPLETO =
  "*, cliente:clientes(id, empresa, ciudad, contacto, telefono, email, direccion, dueno_comercial_id, rfc), dueno:vendedores(id, nombre)";

export async function listarOportunidadesPorPipeline(
  pipeline: PipelineKey
): Promise<Oportunidad[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(SELECT_COMPLETO)
    .eq("pipeline", pipeline)
    // Las ventas directas no son embudo: no aparecen en el tablero.
    .neq("origen", "venta_directa")
    // Los clientes ya reactivados ("Pasar a cliente activo") salen del tablero.
    .neq("estado_cierre", "cliente_activo")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Oportunidad[];
}

export async function listarOportunidadesPorCliente(
  clienteId: string
): Promise<Oportunidad[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(SELECT_COMPLETO)
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Oportunidad[];
}

export async function obtenerOportunidad(
  id: string
): Promise<Oportunidad | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(SELECT_COMPLETO)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Oportunidad | null;
}

export async function obtenerHistorial(
  oportunidadId: string
): Promise<HistorialEtapa[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("oportunidad_historial")
    .select("*")
    .eq("oportunidad_id", oportunidadId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data as HistorialEtapa[];
}

export async function crearOportunidad(datos: {
  cliente_id: string;
  pipeline: PipelineKey;
  dueno_comercial_id?: string | null;
  origen?: "embudo" | "venta_directa";
}): Promise<Oportunidad> {
  const supabase = createClient();
  const etapaInicial = PIPELINES[datos.pipeline].etapas[0];
  const { data, error } = await supabase
    .from("oportunidades")
    .insert({
      cliente_id: datos.cliente_id,
      pipeline: datos.pipeline,
      etapa: etapaInicial,
      dueno_comercial_id: datos.dueno_comercial_id ?? null,
      origen: datos.origen ?? "embudo",
    })
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data as unknown as Oportunidad;
}

/**
 * Reactiva una cuenta de Recuperación SIN borrar nada: cierra la de Recuperación
 * en "Reactivada", pasa al cliente a Activo y crea la oportunidad de Ventas ligada.
 * Devuelve el id de la nueva oportunidad.
 */
export async function reactivarCliente(
  oportunidadId: string,
  etapa: "Negociación" | "Cerrada Ganada"
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reactivar_cliente", {
    p_oportunidad: oportunidadId,
    p_etapa: etapa,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** La oportunidad de Ventas que nació al reactivar esta cuenta de Recuperación (si existe). */
export async function obtenerVentasDeReactivacion(
  oportunidadRecuperacionId: string
): Promise<{ id: string; etapa: string } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("oportunidades")
    .select("id, etapa")
    .eq("origen_recuperacion_id", oportunidadRecuperacionId)
    .maybeSingle();
  return (data as { id: string; etapa: string } | null) ?? null;
}

/** La oportunidad era en realidad un pedido directo: sale del embudo y se cancelan sus seguimientos. */
export async function convertirAVentaDirecta(oportunidadId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("convertir_a_venta_directa", { p_oportunidad: oportunidadId });
  if (error) throw new Error(error.message);
}

/** Actualiza campos y/o mueve la etapa de una oportunidad existente (nunca crea una nueva fila). */
export async function actualizarOportunidad(
  id: string,
  datos: Partial<Oportunidad>
): Promise<Oportunidad> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .update(datos)
    .eq("id", id)
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data as unknown as Oportunidad;
}

/**
 * Un cliente que estaba en Recuperación y ya volvió a comprar: sale del
 * tablero de Recuperación y queda como cliente activo. No registra una venta
 * (las compras se capturan por su oportunidad de Ventas).
 */
export async function pasarAClienteActivo(
  oportunidadId: string,
  clienteId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("oportunidades")
    .update({ estado_cierre: "cliente_activo", fecha_cierre: new Date().toISOString() })
    .eq("id", oportunidadId);
  if (error) throw error;
  const { error: e2 } = await supabase
    .from("clientes")
    .update({ tipo_cliente: "Cartera" })
    .eq("id", clienteId);
  if (e2) throw e2;
}

export async function cerrarOportunidad(
  id: string,
  pipeline: PipelineKey,
  resultado: "ganada" | "perdida",
  motivo?: MotivoPerdida,
  motivoDetalle?: string,
  paresVendidos?: number,
  contextoMeta?: string | null,
  /** Solo la administración: mes en que cuenta la venta (por defecto, ahora). */
  fechaCierre?: string | null,
  notaMes?: string | null
): Promise<Oportunidad> {
  const cfg = PIPELINES[pipeline];
  const supabase = createClient();
  let notasNuevas: string | undefined;
  if (notaMes) {
    const { data: actual } = await supabase.from("oportunidades").select("notas").eq("id", id).single();
    notasNuevas = [actual?.notas, notaMes].filter(Boolean).join("\n");
  }
  const { data, error } = await supabase
    .from("oportunidades")
    .update({
      estado_cierre: resultado,
      etapa: resultado === "ganada" ? cfg.etapaGanada : cfg.etapaPerdida,
      fecha_cierre: fechaCierre || new Date().toISOString(),
      ...(notasNuevas ? { notas: notasNuevas } : {}),
      motivo_perdida: resultado === "perdida" ? motivo ?? null : null,
      motivo_perdida_detalle:
        resultado === "perdida" ? motivoDetalle ?? null : null,
      ...(resultado === "ganada"
        ? { pares_vendidos: paresVendidos ?? null, contexto_meta: contextoMeta ?? null }
        : {}),
    })
    .eq("id", id)
    .select(SELECT_COMPLETO)
    .single();
  if (error) throw error;
  return data as unknown as Oportunidad;
}

/**
 * Cambia el mes en que cuenta una venta ya ganada (solo la administración).
 * El registro de la pestaña Ventas se actualiza solo con la oportunidad.
 */
export async function cambiarMesDeVenta(id: string, fechaCierre: string, nota: string): Promise<void> {
  const supabase = createClient();
  const { data: actual, error: e1 } = await supabase.from("oportunidades").select("notas, estado_cierre").eq("id", id).single();
  if (e1) throw e1;
  if (actual?.estado_cierre !== "ganada") throw new Error("Solo se puede cambiar el mes de una venta ganada.");
  const { error } = await supabase
    .from("oportunidades")
    .update({ fecha_cierre: fechaCierre, notas: [actual?.notas, nota].filter(Boolean).join("\n") })
    .eq("id", id);
  if (error) throw error;
}
