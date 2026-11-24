import { createClient } from "@/lib/supabase/client";
import type { ResultadoLlamada } from "@/lib/types";

export const RESULTADO_LLAMADA: Record<ResultadoLlamada, { label: string; ayuda: string }> = {
  contesto_interesado: {
    label: "Contestó y le interesa",
    ayuda: "Se crea una oportunidad de Ventas en 'Contacto efectivo'.",
  },
  contesto_no_interesa: {
    label: "Contestó y no le interesa",
    ayuda: "Sale de tu lista y vuelve en 6 meses.",
  },
  no_contesto: {
    label: "No contestó",
    ayuda: "Se vuelve a intentar en 30 días (máximo 3 intentos).",
  },
  numero_equivocado: {
    label: "Número equivocado o no existe",
    ayuda: "Se borra el teléfono para que lo corrijas cuando lo consigas.",
  },
  llamar_despues: {
    label: "Pidió que le llamemos después",
    ayuda: "Eliges cuándo y te queda como seguimiento.",
  },
  misma_razon_social: {
    label: "Ya se trabaja con otra razón social",
    ayuda: "Eliges con cuál. Quedan ligadas como mismo grupo y sale de tu lista.",
  },
  gestion_activa: {
    label: "Ya tiene gestión activa",
    ayuda: "Indicas quién lo trabaja. Sale de tu lista; si es de otro vendedor, la administración lo revisa.",
  },
  no_apto: {
    label: "No apto para Rhinoboots – no volver a contactar",
    ayuda: "Queda descartado de forma definitiva (no se borra su historial).",
  },
  otro: {
    label: "Otro",
    ayuda: "Sale de la lista de hoy y vuelve en 30 días.",
  },
};

export const MOTIVOS_NO_APTO: { value: string; label: string }[] = [
  { value: "cerro_no_opera", label: "Cerró o ya no opera" },
  { value: "no_compra_calzado", label: "Ya no compra calzado de seguridad" },
  { value: "mal_historial_pago", label: "Mal historial de pago" },
  { value: "solo_precio", label: "Solo compra por precio, no es nuestro mercado" },
  { value: "contrato_exclusivo", label: "Contrato exclusivo con otro proveedor" },
  { value: "pidio_no_contacto", label: "Pidió no ser contactado" },
  { value: "otro", label: "Otro" },
];

export const etiquetaMotivo = (valor: string | null | undefined): string =>
  MOTIVOS_NO_APTO.find((m) => m.value === valor)?.label ?? "Sin clasificar";

/** Respuestas en las que alguien contestó (para contar "contactos"). */
export const RESPUESTAS_DE_CONTACTO: ResultadoLlamada[] = [
  "contesto_interesado",
  "contesto_no_interesa",
  "llamar_despues",
  "misma_razon_social",
  "gestion_activa",
  "no_apto",
  "otro",
];

/** Registra qué pasó con la llamada. La base de datos hace el resto según el resultado. */
export async function registrarLlamada(datos: {
  tareaId: string;
  resultado: ResultadoLlamada;
  nota: string;
  fecha?: string | null;
  hora?: string | null;
  clienteRelacionadoId?: string | null;
  vendedorId?: string | null;
  oportunidadGestionId?: string | null;
  motivo?: string | null;
}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("registrar_llamada", {
    p_tarea: datos.tareaId,
    p_resultado: datos.resultado,
    p_nota: datos.nota,
    p_fecha: datos.fecha || null,
    p_hora: datos.hora || null,
    p_cliente_rel: datos.clienteRelacionadoId || null,
    p_vendedor: datos.vendedorId || null,
    p_oportunidad_gestion: datos.oportunidadGestionId || null,
    p_motivo: datos.motivo || null,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Cuántas llamadas ha registrado hoy el vendedor (RLS limita a lo que puede ver). */
export async function contarLlamadasDeHoy(vendedorId: string): Promise<number> {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("llamadas")
    .select("id", { count: "exact", head: true })
    .eq("vendedor_id", vendedorId)
    .gte("creado_en", inicio.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export interface FilaLlamadasVendedor {
  vendedorId: string;
  hoy: number;
  semana: number;
  contactos: number;
  noContesto: number;
  oportunidades: number;
  /** Llamadas con fecha de hoy que faltan por registrar. */
  deHoy: number;
  /** Llamadas de días anteriores que siguen sin registrar. */
  atrasadas: number;
  /** Días que lleva sin registrar la llamada atrasada más antigua (0 si no hay). */
  diasMasAntigua: number;
}

/** Resumen por vendedor de las llamadas de hoy y de los últimos 7 días (RLS limita a lo que se puede ver). */
export async function resumenLlamadas(): Promise<FilaLlamadasVendedor[]> {
  const supabase = createClient();
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioSemana.getDate() - 6);
  const hoyIso = new Date().toISOString().slice(0, 10);

  const [{ data: llamadas, error }, { data: tareas, error: errT }] = await Promise.all([
    supabase
      .from("llamadas")
      .select("vendedor_id, resultado, oportunidad_id, creado_en")
      .gte("creado_en", inicioSemana.toISOString()),
    supabase
      .from("tareas")
      .select("dueno_comercial_id, fecha_vencimiento")
      .eq("tipo", "llamada_cartera")
      .eq("estado", "pendiente")
      .lte("fecha_vencimiento", hoyIso),
  ]);
  if (error) throw error;
  if (errT) throw errT;

  const filas = new Map<string, FilaLlamadasVendedor>();
  const fila = (id: string) => {
    let f = filas.get(id);
    if (!f) {
      f = { vendedorId: id, hoy: 0, semana: 0, contactos: 0, noContesto: 0, oportunidades: 0, deHoy: 0, atrasadas: 0, diasMasAntigua: 0 };
      filas.set(id, f);
    }
    return f;
  };
  for (const l of llamadas ?? []) {
    if (!l.vendedor_id) continue;
    const f = fila(l.vendedor_id);
    f.semana++;
    if (new Date(l.creado_en) >= inicioHoy) f.hoy++;
    if (l.resultado === "no_contesto") f.noContesto++;
    if (RESPUESTAS_DE_CONTACTO.includes(l.resultado as ResultadoLlamada)) f.contactos++;
    if (l.oportunidad_id) f.oportunidades++;
  }
  for (const t of tareas ?? []) {
    if (!t.dueno_comercial_id) continue;
    const f = fila(t.dueno_comercial_id);
    if (t.fecha_vencimiento >= hoyIso) f.deHoy++;
    else {
      f.atrasadas++;
      const dias = Math.round((inicioHoy.getTime() - new Date(t.fecha_vencimiento + "T00:00:00").getTime()) / 86400000);
      f.diasMasAntigua = Math.max(f.diasMasAntigua, dias);
    }
  }
  return [...filas.values()];
}

export interface LlamadaSemana {
  vendedor_id: string | null;
  resultado: ResultadoLlamada;
  motivo: string | null;
  oportunidad_id: string | null;
}

/** Llamadas registradas entre dos instantes (inicio incluido, fin excluido). */
export async function llamadasEnRango(desdeIso: string, hastaIso: string): Promise<LlamadaSemana[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("llamadas")
    .select("vendedor_id, resultado, motivo, oportunidad_id")
    .gte("creado_en", desdeIso)
    .lt("creado_en", hastaIso);
  if (error) throw error;
  return (data ?? []) as LlamadaSemana[];
}

export interface FilaBitacora {
  id: string;
  creado_en: string;
  resultado: ResultadoLlamada;
  nota: string | null;
  motivo: string | null;
  oportunidad_id: string | null;
  vendedor_id: string | null;
  cliente: { id: string; empresa: string } | null;
  vendedor: { nombre: string } | null;
  gestionado: { nombre: string } | null;
  relacionado: { empresa: string } | null;
}

/** Llamadas registradas entre dos instantes con su comentario, cliente y vendedor (RLS limita a lo que se puede ver). */
export async function listarBitacoraLlamadas(desdeIso: string, hastaIso: string): Promise<FilaBitacora[]> {
  const supabase = createClient();
  const PAGINA = 1000;
  const todas: FilaBitacora[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("llamadas")
      .select(
        "id, creado_en, resultado, nota, motivo, oportunidad_id, vendedor_id, " +
          "cliente:clientes!llamadas_cliente_id_fkey(id, empresa), " +
          "vendedor:vendedores!llamadas_vendedor_id_fkey(nombre), " +
          "gestionado:vendedores!llamadas_gestionado_por_id_fkey(nombre), " +
          "relacionado:clientes!llamadas_cliente_relacionado_id_fkey(empresa)"
      )
      .gte("creado_en", desdeIso)
      .lt("creado_en", hastaIso)
      .order("creado_en", { ascending: false })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as unknown as FilaBitacora[];
    todas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todas;
}

const aFecha = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export interface DiaLlamadas {
  fecha: string;
  asignadas: number;
  registradas: number;
  /** Llamadas con fecha de ese día o anterior que seguían sin registrar al cerrar el día (null si el día aún no llega). */
  sinRegistrar: number | null;
}

export interface SemanaLlamadasVendedor {
  vendedorId: string;
  dias: DiaLlamadas[];
  asignadas: number;
  registradas: number;
  /** Registradas entre asignadas de la semana, tope 100 (null si no hubo asignadas). */
  cumplimiento: number | null;
}

/** Por vendedor y por día de la semana que empieza en `lunes`: asignadas, registradas y acumuladas sin registrar. */
export async function resumenSemanaLlamadas(lunes: Date): Promise<SemanaLlamadasVendedor[]> {
  const supabase = createClient();
  const inicios: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    inicios.push(d);
  }
  const fin = new Date(inicios[6]);
  fin.setDate(fin.getDate() + 1);
  const fechas = inicios.map(aFecha);
  const ahora = new Date();

  const PAGINA = 1000;
  const tareas: { dueno_comercial_id: string | null; fecha_vencimiento: string; estado: string; completada_at: string | null }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("tareas")
      .select("dueno_comercial_id, fecha_vencimiento, estado, completada_at")
      .eq("tipo", "llamada_cartera")
      .neq("estado", "cancelada")
      .lte("fecha_vencimiento", fechas[6])
      .or(`estado.eq.pendiente,fecha_vencimiento.gte.${fechas[0]},completada_at.gte.${inicios[0].toISOString()}`)
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    tareas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  const llamadas: { vendedor_id: string | null; creado_en: string }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("llamadas")
      .select("vendedor_id, creado_en")
      .gte("creado_en", inicios[0].toISOString())
      .lt("creado_en", fin.toISOString())
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    llamadas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }

  const ids = new Set<string>();
  for (const t of tareas) if (t.dueno_comercial_id) ids.add(t.dueno_comercial_id);
  for (const l of llamadas) if (l.vendedor_id) ids.add(l.vendedor_id);

  return [...ids].map((vendedorId) => {
    const mias = tareas.filter((t) => t.dueno_comercial_id === vendedorId);
    const dias: DiaLlamadas[] = inicios.map((ini, i) => {
      const finDia = new Date(ini);
      finDia.setDate(finDia.getDate() + 1);
      const registradas = llamadas.filter(
        (l) => l.vendedor_id === vendedorId && new Date(l.creado_en) >= ini && new Date(l.creado_en) < finDia
      ).length;
      const sinRegistrar =
        ini > ahora
          ? null
          : mias.filter(
              (t) =>
                t.fecha_vencimiento <= fechas[i] &&
                (t.estado === "pendiente" || (t.completada_at !== null && new Date(t.completada_at) >= finDia))
            ).length;
      return { fecha: fechas[i], asignadas: mias.filter((t) => t.fecha_vencimiento === fechas[i]).length, registradas, sinRegistrar };
    });
    const asignadas = dias.reduce((s, d) => s + d.asignadas, 0);
    const registradas = dias.reduce((s, d) => s + d.registradas, 0);
    return {
      vendedorId,
      dias,
      asignadas,
      registradas,
      cumplimiento: asignadas > 0 ? Math.min(100, Math.round((registradas / asignadas) * 100)) : null,
    };
  });
}

export interface AvisoCarteraAgotada {
  vendedorId: string;
  nombre: string;
  faltaron: number;
}

/** Vendedores a los que hoy no les alcanzaron clientes para completar sus nuevas llamadas. */
export async function avisosCarteraAgotada(dia: string): Promise<AvisoCarteraAgotada[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("llamadas_cartera_avisos")
    .select("vendedor_id, faltaron, vendedor:vendedores(nombre)")
    .eq("dia", dia);
  if (error) throw error;
  return ((data ?? []) as unknown as { vendedor_id: string; faltaron: number; vendedor: { nombre: string } | null }[]).map((a) => ({
    vendedorId: a.vendedor_id,
    nombre: a.vendedor?.nombre ?? "—",
    faltaron: a.faltaron,
  }));
}
