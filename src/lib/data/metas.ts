import { createClient } from "@/lib/supabase/client";
import type { MetaMensual, TarifaMensual, ReglaAcelerador } from "@/lib/types";

export async function listarMetas(anioMes: string): Promise<MetaMensual[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("metas_mensuales")
    .select("*")
    .eq("anio_mes", anioMes)
    .order("tipo")
    .order("etiqueta");
  if (error) throw error;
  return data as MetaMensual[];
}

export type NuevaMeta = Omit<MetaMensual, "id">;

export async function guardarMetas(filas: NuevaMeta[]): Promise<void> {
  if (filas.length === 0) return;
  const supabase = createClient();
  const { error } = await supabase.from("metas_mensuales").insert(filas);
  if (error) throw error;
}

export async function actualizarMeta(
  id: string,
  cambios: Partial<
    Pick<
      MetaMensual,
      | "meta_total_pares"
      | "piso_piel_pares"
      | "etiqueta"
      | "visitas_requeridas"
      | "visitas_para_id"
    >
  >
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("metas_mensuales").update(cambios).eq("id", id);
  if (error) throw error;
}

export async function borrarMeta(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("metas_mensuales").delete().eq("id", id);
  if (error) throw error;
}

/** Copia todas las metas de un mes a otro (no pisa las que ya existan en el destino). */
export async function copiarMetasDelMesAnterior(
  mesOrigen: string,
  mesDestino: string
): Promise<number> {
  const existentes = await listarMetas(mesDestino);
  if (existentes.length > 0) {
    throw new Error(
      `El mes ${mesDestino} ya tiene ${existentes.length} meta(s) capturada(s). Bórralas primero si quieres reemplazarlas.`
    );
  }
  const origen = await listarMetas(mesOrigen);
  if (origen.length === 0) return 0;
  const nuevas: NuevaMeta[] = origen.map((m) => ({
    tipo: m.tipo,
    vendedor_id: m.vendedor_id,
    unidad_negocio: m.unidad_negocio,
    etiqueta: m.etiqueta,
    anio_mes: mesDestino,
    meta_total_pares: m.meta_total_pares,
    piso_piel_pares: m.piso_piel_pares,
    visitas_requeridas: m.visitas_requeridas,
    visitas_para_id: m.visitas_para_id,
  }));
  await guardarMetas(nuevas);
  return nuevas.length;
}

// ---------------------------------------------------------------- Tarifas

export async function listarTarifas(anioMes: string): Promise<TarifaMensual[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tarifas_mensuales")
    .select("*")
    .eq("anio_mes", anioMes);
  if (error) throw error;
  return data as TarifaMensual[];
}

export async function guardarTarifa(
  anioMes: string,
  linea: string,
  tarifaPorPar: number,
  tarifaSinLlave: number = tarifaPorPar
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("tarifas_mensuales")
    .upsert(
      { anio_mes: anioMes, linea, tarifa_por_par: tarifaPorPar, tarifa_sin_llave: tarifaSinLlave },
      { onConflict: "anio_mes,linea" }
    );
  if (error) throw error;
}

export async function listarReglasAcelerador(anioMes: string): Promise<ReglaAcelerador[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reglas_acelerador")
    .select("*")
    .eq("anio_mes", anioMes)
    .order("orden");
  if (error) throw error;
  return data as ReglaAcelerador[];
}

export async function agregarReglaAcelerador(
  anioMes: string,
  umbralPct: number,
  multiplicador: number,
  orden: number,
  bonoPorPar: number = 0
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reglas_acelerador")
    .insert({
      anio_mes: anioMes,
      umbral_pct: umbralPct,
      multiplicador,
      orden,
      bono_por_par: bonoPorPar,
    });
  if (error) throw error;
}

export async function borrarReglaAcelerador(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("reglas_acelerador").delete().eq("id", id);
  if (error) throw error;
}
