import { createClient } from "@/lib/supabase/client";
import { nombreSeguroArchivo } from "@/lib/nombre-archivo";
import type { Muestra, MuestraHistorial, ResultadoPrueba, UnidadPrueba } from "@/lib/types";

const SELECT_MUESTRA =
  "*, renglones:muestras_renglones(*), vendedor:vendedores!muestras_vendedor_id_fkey(id, nombre), aprobador:vendedores!muestras_aprobado_por_fkey(id, nombre), cliente:clientes(id, empresa), oportunidad:oportunidades(id, pipeline, etapa, estado_cierre, valor_estimado)";

function ordenarRenglones(ms: Muestra[]): Muestra[] {
  return ms.map((m) => ({ ...m, renglones: [...(m.renglones ?? [])].sort((a, b) => a.orden - b.orden) }));
}

export async function listarMuestrasPorOportunidad(oportunidadId: string): Promise<Muestra[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("muestras")
    .select(SELECT_MUESTRA)
    .eq("oportunidad_id", oportunidadId)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return ordenarRenglones(data as unknown as Muestra[]);
}

/** Todas las muestras que esta cuenta puede ver (RLS: el vendedor solo las suyas). */
export async function listarMuestras(): Promise<Muestra[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("muestras")
    .select(SELECT_MUESTRA)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return ordenarRenglones(data as unknown as Muestra[]);
}

export async function listarHistorialMuestra(muestraId: string): Promise<MuestraHistorial[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("muestra_historial")
    .select("*, autor:vendedores(id, nombre)")
    .eq("muestra_id", muestraId)
    .order("creado_en", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MuestraHistorial[];
}

// ------------------------------------------------------------------ acciones
export interface RenglonSolicitud {
  estilo: string;
  linea: string;
  talla: string;
  pares: number;
}

async function rpc(nombre: string, args: Record<string, unknown>) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function crearSolicitudMuestra(datos: {
  oportunidadId: string;
  ficha: Record<string, string>;
  justificacionNecesidad: string;
  justificacionModelos: string;
  pruebaValor: number;
  pruebaUnidad: UnidadPrueba;
  renglones: RenglonSolicitud[];
}): Promise<string> {
  return (await rpc("crear_solicitud_muestra", {
    p_oportunidad: datos.oportunidadId,
    p_ficha: datos.ficha,
    p_just_necesidad: datos.justificacionNecesidad,
    p_just_modelos: datos.justificacionModelos,
    p_prueba_valor: datos.pruebaValor,
    p_prueba_unidad: datos.pruebaUnidad,
    p_renglones: datos.renglones,
  })) as string;
}

export async function aprobarMuestra(muestraId: string, renglones: { id: string; pares: number }[]) {
  await rpc("aprobar_muestra", { p_muestra: muestraId, p_renglones: renglones });
}

export async function rechazarMuestra(muestraId: string, motivo: string) {
  await rpc("rechazar_muestra", { p_muestra: muestraId, p_motivo: motivo });
}

export interface SeguimientoNuevo {
  nombre: string;
  fecha: string;
  hora: string;
  detalle: string;
  rol: string;
}

export async function registrarEntregaMuestra(datos: {
  muestraId: string;
  fecha: string;
  forma: string;
  recibio: string;
  valor: number;
  unidad: UnidadPrueba;
  evaluadorNombre: string;
  evaluadorContacto: string;
  seguimientos: SeguimientoNuevo[];
}) {
  await rpc("registrar_entrega_muestra", {
    p_muestra: datos.muestraId,
    p_fecha: datos.fecha,
    p_forma: datos.forma,
    p_recibio: datos.recibio,
    p_valor: datos.valor,
    p_unidad: datos.unidad,
    p_eval_nombre: datos.evaluadorNombre,
    p_eval_contacto: datos.evaluadorContacto,
    p_seguimientos: datos.seguimientos,
  });
}

export async function modificarPruebaMuestra(datos: {
  muestraId: string;
  valor: number;
  unidad: UnidadPrueba;
  motivo: string;
  nuevoSeguimiento: SeguimientoNuevo | null;
}) {
  await rpc("modificar_prueba_muestra", {
    p_muestra: datos.muestraId,
    p_valor: datos.valor,
    p_unidad: datos.unidad,
    p_motivo: datos.motivo,
    p_nuevo: datos.nuevoSeguimiento,
  });
}

export async function pasarAEvaluacionFinal(muestraId: string, motivo: string) {
  await rpc("pasar_a_evaluacion_final", { p_muestra: muestraId, p_motivo: motivo });
}

export async function evaluarMuestra(datos: {
  muestraId: string;
  resultado: string;
  comentarios: string;
  motivo: string;
  devolucion: string;
}) {
  await rpc("evaluar_muestra", {
    p_muestra: datos.muestraId,
    p_resultado: datos.resultado,
    p_comentarios: datos.comentarios,
    p_motivo: datos.motivo,
    p_devolucion: datos.devolucion,
  });
}

export async function cerrarMuestra(muestraId: string, comentario: string) {
  await rpc("cerrar_muestra", { p_muestra: muestraId, p_comentario: comentario });
}

/** Estado de la prueba que el vendedor reporta al registrar un seguimiento de muestra. */
export async function guardarResultadoPrueba(tareaId: string, resultado: ResultadoPrueba) {
  const supabase = createClient();
  const { error } = await supabase.from("tareas").update({ resultado_prueba: resultado }).eq("id", tareaId);
  if (error) throw error;
}

// ------------------------------------------------------------------ evidencia
export interface ArchivoMuestra {
  name: string;
  path: string;
}

export async function subirEvidenciaMuestra(muestraId: string, file: File): Promise<void> {
  const supabase = createClient();
  const path = `${muestraId}/${Date.now()}-${nombreSeguroArchivo(file.name)}`;
  const { error } = await supabase.storage.from("muestras_evidencia").upload(path, file);
  if (error) throw error;
}

export async function listarEvidenciaMuestra(muestraId: string): Promise<ArchivoMuestra[]> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("muestras_evidencia").list(muestraId);
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({ name: f.name, path: `${muestraId}/${f.name}` }));
}

export async function urlEvidenciaMuestra(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("muestras_evidencia").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}
