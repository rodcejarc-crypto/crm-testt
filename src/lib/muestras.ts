import type { EstadoMuestra, Muestra, ResultadoMuestra, ResultadoPrueba, UnidadPrueba } from "@/lib/types";

// ----------------------------------------------------------- fechas (YYYY-MM-DD)
function aFecha(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function aIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function hoyIso(): string {
  return aIso(new Date());
}

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso);
  d.setDate(d.getDate() + dias);
  return aIso(d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86400000);
}

/** Igual que la base de datos: los meses se suman sin pasarse del último día del mes. */
export function fechaFinPrueba(fechaEntrega: string, valor: number, unidad: UnidadPrueba): string {
  if (unidad === "dias") return sumarDias(fechaEntrega, valor);
  if (unidad === "semanas") return sumarDias(fechaEntrega, valor * 7);
  const d = aFecha(fechaEntrega);
  const dia = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + valor, 1, 12, 0, 0);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dia, ultimo));
  return aIso(r);
}

// ----------------------------------------------------- seguimientos propuestos
export interface SeguimientoPropuesto {
  clave: string;
  nombre: string;
  fecha: string;
  hora: string;
  detalle: string;
  rol: "recepcion" | "revision" | "final" | "extra";
}

/**
 * Propone las fechas de seguimiento de una prueba:
 *  - confirmación de recepción: 2 días después de la entrega;
 *  - revisiones intermedias: si la prueba dura más de 30 días, una cada 30
 *    días; si dura 30 días o menos, una a la mitad;
 *  - evaluación final: en la fecha fin de prueba.
 */
export function proponerSeguimientos(
  fechaEntrega: string,
  valor: number,
  unidad: UnidadPrueba
): SeguimientoPropuesto[] {
  if (!fechaEntrega || !valor || valor <= 0) return [];
  const fin = fechaFinPrueba(fechaEntrega, valor, unidad);
  const dur = diasEntre(fechaEntrega, fin);
  const out: SeguimientoPropuesto[] = [];

  const recepcion = sumarDias(fechaEntrega, 2);
  if (recepcion < fin) {
    out.push({ clave: "recepcion", nombre: "Confirmación de recepción", fecha: recepcion, hora: "", detalle: "", rol: "recepcion" });
  }

  if (dur > 30) {
    let n = 1;
    for (let dia = 30; dia < dur; dia += 30) {
      const f = sumarDias(fechaEntrega, dia);
      if (f <= recepcion) continue;
      out.push({ clave: `rev${n}`, nombre: `Revisión intermedia ${n}`, fecha: f, hora: "", detalle: "", rol: "revision" });
      n += 1;
    }
  } else if (dur >= 4) {
    const mitad = sumarDias(fechaEntrega, Math.floor(dur / 2));
    if (mitad > recepcion && mitad < fin) {
      out.push({ clave: "mitad", nombre: "Revisión a mitad de prueba", fecha: mitad, hora: "", detalle: "", rol: "revision" });
    }
  }

  out.push({ clave: "final", nombre: "Evaluación final", fecha: fin, hora: "", detalle: "", rol: "final" });
  return out;
}

// -------------------------------------------------------------------- estados
export const ESTADO_MUESTRA: Record<EstadoMuestra, { label: string; color: string }> = {
  solicitada: { label: "Por aprobar", color: "bg-yellow-100 text-yellow-800" },
  aprobada: { label: "Aprobada · por entregar", color: "bg-blue-100 text-blue-800" },
  rechazada: { label: "Rechazada", color: "bg-red-100 text-red-800" },
  entregada: { label: "Entregada", color: "bg-indigo-100 text-indigo-800" },
  en_prueba: { label: "En prueba", color: "bg-indigo-100 text-indigo-800" },
  evaluada: { label: "Evaluada", color: "bg-green-100 text-green-800" },
  cerrada: { label: "Cerrada", color: "bg-section text-ink-muted" },
};

export const FORMA_ENTREGA: Record<string, string> = {
  en_persona: "En persona",
  paqueteria: "Paquetería",
  cliente_recoge: "El cliente recoge",
};

export const DEVOLUCION: Record<string, string> = {
  se_devuelve: "Se devuelven las muestras",
  se_queda_sin_costo: "Se quedan sin costo",
  se_cobra: "Se cobran",
};

export const RESULTADO_MUESTRA: Record<ResultadoMuestra, string> = {
  aprobada_cliente: "Aprobada por el cliente",
  rechazada: "Rechazada por el cliente",
  sin_respuesta: "Sin respuesta",
};

export const ESTADO_PRUEBA: Record<ResultadoPrueba, { label: string; color: string }> = {
  va_bien: { label: "Va bien", color: "bg-green-100 text-green-800" },
  observaciones: { label: "Tiene observaciones", color: "bg-yellow-100 text-yellow-800" },
  rechazada: { label: "El cliente la rechazó", color: "bg-red-100 text-red-800" },
  sin_respuesta: { label: "Sin respuesta", color: "bg-section text-ink-muted" },
};

export const MOTIVOS_RECHAZO_CLIENTE = [
  "Precio",
  "Calidad",
  "Comodidad",
  "Talla",
  "No cumple norma",
  "Eligió a la competencia",
  "Otro",
];

export const DIAS_PARA_VENCER = 7;

/** Días que faltan para terminar la prueba (negativo si ya pasó). */
export function diasRestantes(m: Pick<Muestra, "fecha_fin_prueba">): number | null {
  if (!m.fecha_fin_prueba) return null;
  return diasEntre(hoyIso(), m.fecha_fin_prueba);
}

/** En prueba y pasaron más de 7 días de la fecha fin sin evaluarla. */
export function esVencida(m: Pick<Muestra, "estado" | "fecha_fin_prueba">): boolean {
  if (m.estado !== "en_prueba" || !m.fecha_fin_prueba) return false;
  return diasEntre(m.fecha_fin_prueba, hoyIso()) > DIAS_PARA_VENCER;
}

export function totalPares(m: Pick<Muestra, "renglones">): number {
  return (m.renglones ?? []).reduce((s, r) => s + r.pares, 0);
}

export function formatoFechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = iso.length > 10 ? iso.slice(0, 10) : iso;
  return aFecha(s).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export function textoDuracion(valor: number | null, unidad: UnidadPrueba | null): string {
  if (!valor || !unidad) return "—";
  const nombre = { dias: "día", semanas: "semana", meses: "mes" }[unidad];
  const plural = unidad === "meses" ? "meses" : nombre + "s";
  return `${valor} ${valor === 1 ? nombre : plural}`;
}

// ------------------------------------------------------------------ dashboard
export interface ResumenMuestras {
  porAprobar: number;
  enPrueba: number;
  vencidas: number;
  paresEntregadosMes: { vendedorId: string; nombre: string; pares: number }[];
  aprobadasPorCliente: number;
  convertidas: number;
}

/** Cifras del bloque "Muestras" del Dashboard (el mes elegido es "YYYY-MM"). */
export function calcularResumenMuestras(muestras: Muestra[], anioMes: string): ResumenMuestras {
  const porVendedor = new Map<string, { nombre: string; pares: number }>();
  for (const m of muestras) {
    if (!m.fecha_entrega || !m.fecha_entrega.startsWith(anioMes)) continue;
    const k = m.vendedor_id ?? "sin";
    const actual = porVendedor.get(k) ?? { nombre: m.vendedor?.nombre ?? "Sin asignar", pares: 0 };
    actual.pares += totalPares(m);
    porVendedor.set(k, actual);
  }
  const aprobadas = muestras.filter((m) => m.resultado === "aprobada_cliente");
  return {
    porAprobar: muestras.filter((m) => m.estado === "solicitada").length,
    enPrueba: muestras.filter((m) => m.estado === "en_prueba").length,
    vencidas: muestras.filter((m) => esVencida(m)).length,
    paresEntregadosMes: [...porVendedor.entries()]
      .map(([vendedorId, v]) => ({ vendedorId, ...v }))
      .sort((a, b) => b.pares - a.pares),
    aprobadasPorCliente: aprobadas.length,
    convertidas: aprobadas.filter((m) => m.oportunidad?.estado_cierre === "ganada").length,
  };
}
