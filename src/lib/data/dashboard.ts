import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaMensual, Oportunidad, PipelineKey, VentaCerrada } from "@/lib/types";

const SELECT_OPORTUNIDADES =
  "*, cliente:clientes(id, empresa, ciudad, contacto, dueno_comercial_id), dueno:vendedores(id, nombre)";

/**
 * Todas las oportunidades de los 3 pipelines (solo para el dashboard admin).
 * Por default usa el cliente de navegador; el cron mensual le pasa un
 * cliente "admin" porque corre en el servidor, sin sesión de usuario.
 */
export async function obtenerOportunidadesTodas(
  clienteExterno?: SupabaseClient
): Promise<Oportunidad[]> {
  const supabase = clienteExterno ?? createClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(SELECT_OPORTUNIDADES)
    // Las ventas directas no son embudo (siguen contando en ventas_cerradas).
    .neq("origen", "venta_directa");
  if (error) throw error;
  return data as unknown as Oportunidad[];
}

export interface HistorialConContexto {
  id: string;
  oportunidad_id: string;
  etapa_anterior: string | null;
  etapa_nueva: string;
  fecha: string;
  oportunidad: { pipeline: PipelineKey; dueno_comercial_id: string | null; origen?: string } | null;
}

/** Todo el historial de etapas, con el pipeline y dueño de cada oportunidad. */
export async function obtenerHistorialTodo(
  clienteExterno?: SupabaseClient
): Promise<HistorialConContexto[]> {
  const supabase = clienteExterno ?? createClient();
  const { data, error } = await supabase
    .from("oportunidad_historial")
    .select(
      "id, oportunidad_id, etapa_anterior, etapa_nueva, fecha, oportunidad:oportunidades(pipeline, dueno_comercial_id, origen)"
    );
  if (error) throw error;
  return (data as unknown as HistorialConContexto[]).filter(
    (h) => h.oportunidad?.origen !== "venta_directa"
  );
}

export interface CheckinCompletado {
  id: string;
  dueno_comercial_id: string | null;
  completada_at: string | null;
}

/** Check-ins de cuentas clave completados (para el ranking de actividad). */
export async function obtenerCheckinsCompletados(
  clienteExterno?: SupabaseClient
): Promise<CheckinCompletado[]> {
  const supabase = clienteExterno ?? createClient();
  const { data, error } = await supabase
    .from("tareas")
    .select("id, dueno_comercial_id, completada_at")
    .eq("tipo", "checkin_cuenta_clave")
    .eq("estado", "completada");
  if (error) throw error;
  return data as CheckinCompletado[];
}

/**
 * Todas las ventas cerradas (los 3 pipelines). El dashboard saca de aquí
 * pares vendidos, adjudicadas, reactivadas y cierres — no cuenta tarjetas
 * de cada pipeline por separado.
 */
export async function obtenerVentasCerradas(
  clienteExterno?: SupabaseClient
): Promise<VentaCerrada[]> {
  const supabase = clienteExterno ?? createClient();
  const { data, error } = await supabase.from("ventas_cerradas").select("*");
  if (error) throw error;
  return data as VentaCerrada[];
}

/** Metas capturadas (vendedor o unidad) para un mes puntual. */
export async function obtenerMetasMes(
  anioMes: string,
  clienteExterno?: SupabaseClient
): Promise<MetaMensual[]> {
  const supabase = clienteExterno ?? createClient();
  const { data, error } = await supabase
    .from("metas_mensuales")
    .select("*")
    .eq("anio_mes", anioMes);
  if (error) throw error;
  return data as MetaMensual[];
}
