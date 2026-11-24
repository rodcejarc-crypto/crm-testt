import { createClient } from "@/lib/supabase/client";
import type { Tarea } from "@/lib/types";

const SELECT_COMPLETO =
  "*, oportunidad:oportunidades(id, pipeline, cliente_id, cliente:clientes(id, empresa)), cliente:clientes(id, empresa, ciudad, telefono, email, contacto, observaciones, origen), dueno:vendedores(id, nombre), muestra:muestras(id, fecha_fin_prueba, estado)";

/**
 * Tareas pendientes de hoy y atrasadas (para la pantalla de seguimientos).
 * RLS ya filtra: un vendedor solo ve las suyas, un admin las ve todas.
 */
export async function listarTareasHoyYAtrasadas(): Promise<Tarea[]> {
  const supabase = createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("tareas")
    .select(SELECT_COMPLETO)
    .eq("estado", "pendiente")
    .lte("fecha_vencimiento", hoy)
    .order("fecha_vencimiento", { ascending: true });
  if (error) throw error;
  return data as unknown as Tarea[];
}

/**
 * Tareas pendientes que vienen próximamente (después de hoy, hasta N días
 * adelante) — para que se vea que sí hay un calendario armado aunque nada
 * venza todavía.
 */
export async function listarTareasProximas(diasAdelante: number = 14): Promise<Tarea[]> {
  const supabase = createClient();
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + diasAdelante);
  const limiteStr = limite.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("tareas")
    .select(SELECT_COMPLETO)
    .eq("estado", "pendiente")
    .gt("fecha_vencimiento", hoyStr)
    .lte("fecha_vencimiento", limiteStr)
    .order("fecha_vencimiento", { ascending: true });
  if (error) throw error;
  return data as unknown as Tarea[];
}

export async function listarTareasPorOportunidad(
  oportunidadId: string
): Promise<Tarea[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tareas")
    .select(SELECT_COMPLETO)
    .eq("oportunidad_id", oportunidadId)
    .order("fecha_vencimiento", { ascending: true });
  if (error) throw error;
  return data as unknown as Tarea[];
}

/**
 * Registra un seguimiento: deja la nota de qué pasó / qué necesita el
 * cliente y marca la tarea como completada. Si se da fecha (y hora, si el
 * cliente dio una hora exacta) para el próximo contacto, crea la siguiente
 * tarea pendiente — así el propio vendedor arma su próximo paso, en vez de
 * depender solo del calendario automático de Día 2/5/10...
 */
export async function completarTarea(
  id: string,
  opts?: { nota?: string; proximaFecha?: string; proximaHora?: string; resultadoPrueba?: string }
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("tareas")
    .update({
      estado: "completada",
      completada_at: new Date().toISOString(),
      nota: opts?.nota?.trim() || null,
      ...(opts?.resultadoPrueba ? { resultado_prueba: opts.resultadoPrueba } : {}),
    })
    .eq("id", id);
  if (error) throw error;

  if (opts?.proximaFecha) {
    const { data: actual, error: errGet } = await supabase
      .from("tareas")
      .select("tipo, oportunidad_id, cliente_id, dueno_comercial_id")
      .eq("id", id)
      .single();
    if (errGet) throw errGet;

    const { error: errIns } = await supabase.from("tareas").insert({
      tipo: actual.tipo,
      titulo: "Seguimiento programado con el cliente",
      fecha_vencimiento: opts.proximaFecha,
      hora_vencimiento: opts.proximaHora || null,
      oportunidad_id: actual.oportunidad_id,
      cliente_id: actual.cliente_id,
      dueno_comercial_id: actual.dueno_comercial_id,
    });
    if (errIns) throw errIns;
  }
}
