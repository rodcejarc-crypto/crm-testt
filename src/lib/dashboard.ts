import type {
  CheckinCompletado,
  HistorialConContexto,
} from "@/lib/data/dashboard";
import type { MetaMensual, Oportunidad, Vendedor, VentaCerrada } from "@/lib/types";

export function enMes(fechaISO: string | null, anioMes: string): boolean {
  return Boolean(fechaISO && fechaISO.slice(0, 7) === anioMes);
}

export const FUNNEL_VENTAS: { desde: string; hasta: string; meta: number; label: string }[] = [
  { desde: "Lead generado", hasta: "Contacto efectivo", meta: 0.6, label: "Lead → Contacto" },
  { desde: "Contacto efectivo", hasta: "Oportunidad calificada", meta: 0.5, label: "Contacto → Oportunidad" },
  { desde: "Oportunidad calificada", hasta: "Cotización enviada", meta: 0.8, label: "Oportunidad → Cotización" },
  { desde: "Cotización enviada", hasta: "Cerrada Ganada", meta: 0.3, label: "Cotización → Cierre" },
  { desde: "Cerrada Ganada", hasta: "Postventa", meta: 0.6, label: "Cierre → Recompra" },
];

/** Etapas del camino principal de Ventas, en orden (sin "Cerrada Perdida"). */
const CAMINO_VENTAS = [
  "Lead generado",
  "Contacto efectivo",
  "Oportunidad calificada",
  "Cotización enviada",
  "Cerrada Ganada",
  "Postventa",
];

export interface DatosDashboard {
  anioMes: string;
  ahora: number;
  oportunidades: Oportunidad[];
  historial: HistorialConContexto[];
  checkins: CheckinCompletado[];
  vendedores: Vendedor[];
  metas: MetaMensual[];
  ventasCerradas: VentaCerrada[];
}

export interface PasoFunnel {
  label: string;
  meta: number;
  base: number;
  real: number | null;
}

export interface FilaParesVendedor {
  id: string;
  nombre: string;
  real: number;
  meta: number;
  cumplimiento: number | null;
}

export interface FilaParesUnidad {
  id: string;
  nombre: string;
  real: number;
  meta: number;
  cumplimiento: number | null;
}

export interface FilaRecuperacionEtapa {
  etapa: string;
  total: number;
  alta: number;
}

export interface OportunidadEstancada {
  id: string;
  pipeline: string;
  etapa: string;
  empresa: string;
  vendedorNombre: string;
  diasEstancada: number;
}

export interface FilaRanking {
  id: string;
  nombre: string;
  leads: number;
  contactos: number;
  cotizaciones: number;
  licitacionesArmadas: number;
  reactivacionContactos: number;
  checkins: number;
  cierres: number;
  total: number;
}

export interface ResultadoDashboard {
  // Ventas
  funnelResultado: PasoFunnel[];
  paresPorVendedor: FilaParesVendedor[];
  paresPorUnidad: FilaParesUnidad[];
  totalParesReal: number;
  totalParesMeta: number;
  // Licitaciones
  licitacionesParticipadasMes: number;
  licitacionesAdjudicadasMes: number;
  tasaExitoLicitaciones: number | null;
  montoLicitacionesActivas: number;
  // Recuperación
  recuperacionPorEtapa: FilaRecuperacionEtapa[];
  reactivadasMes: number;
  facturacionRecuperada: number;
  facturacionIdentificada: number;
  // Estancadas
  estancadas: OportunidadEstancada[];
  // Ranking
  rankingFilas: FilaRanking[];
}

/**
 * Toma los datos crudos (oportunidades, historial, ventas cerradas, metas,
 * vendedores) y calcula las 5 secciones del dashboard ejecutivo. Función
 * pura para que la pantalla /dashboard y el correo mensual automático
 * calculen exactamente lo mismo, del mismo lugar.
 */
export function calcularDashboard(datos: DatosDashboard): ResultadoDashboard {
  const { anioMes, ahora, oportunidades, historial, checkins, vendedores, metas, ventasCerradas } =
    datos;

  const nombrePorId = new Map(vendedores.map((v) => [v.id, v.nombre]));
  const nombreVendedor = (id: string | null) => (id ? nombrePorId.get(id) || "Sin asignar" : "Sin asignar");

  // ---------------------------------------------------------------- Ventas
  const historialVentas = historial.filter((h) => h.oportunidad?.pipeline === "ventas");
  // El historial solo guarda la etapa destino de cada movimiento: si una
  // oportunidad se crea directo en "Cotización enviada" o salta de "Lead" a
  // "Cerrada Ganada", las etapas intermedias no quedan registradas. Por eso
  // una oportunidad "alcanzó" una etapa si llegó a ella O A CUALQUIER ETAPA
  // POSTERIOR del camino principal. Así cada paso compara el mismo grupo de
  // oportunidades y la conversión nunca puede pasar de 100%.
  const etapaMaxima = new Map<string, number>();
  for (const h of historialVentas) {
    const idx = CAMINO_VENTAS.indexOf(h.etapa_nueva);
    if (idx < 0) continue; // "Cerrada Perdida" no avanza en el camino
    if (idx > (etapaMaxima.get(h.oportunidad_id) ?? -1)) etapaMaxima.set(h.oportunidad_id, idx);
  }
  const cuantasAlcanzaron = (etapa: string) => {
    const idxEtapa = CAMINO_VENTAS.indexOf(etapa);
    let n = 0;
    for (const idx of etapaMaxima.values()) if (idx >= idxEtapa) n++;
    return n;
  };
  const funnelResultado: PasoFunnel[] = FUNNEL_VENTAS.map((paso) => {
    const base = cuantasAlcanzaron(paso.desde);
    const real = base > 0 ? cuantasAlcanzaron(paso.hasta) / base : null;
    return { label: paso.label, meta: paso.meta, base, real };
  });

  const ventasCerradasMes = ventasCerradas.filter((v) => enMes(v.fecha_cierre, anioMes));

  const paresMap = new Map<string, number>();
  ventasCerradasMes
    .filter((v) => v.pipeline === "ventas")
    .forEach((v) => {
      const id = v.dueno_comercial_id || "sin_asignar";
      paresMap.set(id, (paresMap.get(id) || 0) + (v.pares_vendidos || 0));
    });
  // Una persona puede tener varias metas el mismo mes (ej. "Nayeli — B2B" y
  // "Nayeli — Tienda"): se suman. Las metas de unidad (ej. Guadalajara) no
  // se reparten por persona — se comparan contra la suma real del equipo.
  const metaPorVendedor = new Map<string, number>();
  metas
    .filter((m) => m.tipo === "vendedor" && m.vendedor_id)
    .forEach((m) => {
      metaPorVendedor.set(
        m.vendedor_id as string,
        (metaPorVendedor.get(m.vendedor_id as string) || 0) + Number(m.meta_total_pares)
      );
    });
  const metasUnidad = metas.filter((m) => m.tipo === "unidad");

  const paresPorVendedor: FilaParesVendedor[] = vendedores
    .filter((v) => (paresMap.get(v.id) || 0) > 0 || (metaPorVendedor.get(v.id) || 0) > 0)
    .map((v) => {
      const real = paresMap.get(v.id) || 0;
      const meta = metaPorVendedor.get(v.id) || 0;
      return { id: v.id, nombre: v.nombre, real, meta, cumplimiento: meta > 0 ? real / meta : null };
    });

  const paresPorUnidad: FilaParesUnidad[] = metasUnidad.map((m) => {
    const real = vendedores
      .filter(
        (v) =>
          v.unidad_negocio &&
          m.unidad_negocio &&
          v.unidad_negocio.toLowerCase().includes(m.unidad_negocio.toLowerCase())
      )
      .reduce((s, v) => s + (paresMap.get(v.id) || 0), 0);
    const meta = Number(m.meta_total_pares);
    return {
      id: m.id,
      nombre: `🏢 ${m.unidad_negocio}`,
      real,
      meta,
      cumplimiento: meta > 0 ? real / meta : null,
    };
  });

  const totalParesReal = Array.from(paresMap.values()).reduce((s, v) => s + v, 0);
  const totalParesMeta =
    Array.from(metaPorVendedor.values()).reduce((s, v) => s + v, 0) +
    metasUnidad.reduce((s, m) => s + Number(m.meta_total_pares), 0);

  // ------------------------------------------------------------ Licitaciones
  const licitaciones = oportunidades.filter((o) => o.pipeline === "licitaciones");
  const licitacionesParticipadasMes = licitaciones.filter((o) => enMes(o.created_at, anioMes));
  const licitacionesAdjudicadasMes = ventasCerradasMes.filter((v) => v.pipeline === "licitaciones");
  const tasaExitoLicitaciones =
    licitacionesParticipadasMes.length > 0
      ? licitacionesAdjudicadasMes.length / licitacionesParticipadasMes.length
      : null;
  const montoLicitacionesActivas = licitaciones
    .filter((o) => o.estado_cierre === "abierta")
    .reduce((s, o) => s + (o.monto_estimado || 0), 0);

  // ----------------------------------------------------------- Recuperación
  const recuperacion = oportunidades.filter((o) => o.pipeline === "recuperacion");
  const recuperacionPorEtapaMap = new Map<string, { total: number; alta: number }>();
  recuperacion.forEach((o) => {
    const e = recuperacionPorEtapaMap.get(o.etapa) || { total: 0, alta: 0 };
    e.total += 1;
    if (o.prioridad_recuperacion === "Alta") e.alta += 1;
    recuperacionPorEtapaMap.set(o.etapa, e);
  });
  const recuperacionPorEtapa: FilaRecuperacionEtapa[] = Array.from(
    recuperacionPorEtapaMap.entries()
  )
    .map(([etapa, v]) => ({ etapa, ...v }))
    .sort((a, b) => b.alta - a.alta);
  // Una reactivación ya no registra venta propia (la venta nace en la oportunidad
  // de Ventas ligada): se cuentan las oportunidades de Recuperación reactivadas.
  const reactivadasMes = recuperacion.filter(
    (o) => o.estado_cierre === "ganada" && enMes(o.fecha_cierre, anioMes)
  ).length;
  const facturacionRecuperada = recuperacion
    .filter((o) => o.estado_cierre === "ganada")
    .reduce((s, o) => s + (o.facturacion_historica || 0), 0);
  const facturacionIdentificada = recuperacion.reduce(
    (s, o) => s + (o.facturacion_historica || 0),
    0
  );

  // ------------------------------------------------------------- Estancadas
  const ultimoCambio = new Map<string, string>();
  historial.forEach((h) => {
    const actual = ultimoCambio.get(h.oportunidad_id);
    if (!actual || h.fecha > actual) ultimoCambio.set(h.oportunidad_id, h.fecha);
  });
  const estancadas: OportunidadEstancada[] = oportunidades
    .filter((o) => o.estado_cierre === "abierta")
    .map((o) => {
      const ultima = ultimoCambio.get(o.id) || o.created_at;
      const dias = Math.floor((ahora - new Date(ultima).getTime()) / 86400000);
      return {
        id: o.id,
        pipeline: o.pipeline,
        etapa: o.etapa,
        empresa: o.cliente?.empresa || "Cliente",
        vendedorNombre: nombreVendedor(o.dueno_comercial_id),
        diasEstancada: dias,
      };
    })
    .filter((o) => o.diasEstancada > 15)
    .sort((a, b) => b.diasEstancada - a.diasEstancada);

  // -------------------------------------------------------------- Ranking
  interface Actividad {
    leads: number;
    contactos: number;
    cotizaciones: number;
    licitacionesArmadas: number;
    reactivacionContactos: number;
    checkins: number;
    cierres: number;
  }
  const actividad = new Map<string, Actividad>();
  function suma(id: string | null, campo: keyof Actividad) {
    const key = id || "sin_asignar";
    const a =
      actividad.get(key) || {
        leads: 0,
        contactos: 0,
        cotizaciones: 0,
        licitacionesArmadas: 0,
        reactivacionContactos: 0,
        checkins: 0,
        cierres: 0,
      };
    a[campo] += 1;
    actividad.set(key, a);
  }
  oportunidades
    .filter((o) => o.pipeline === "ventas" && enMes(o.created_at, anioMes))
    .forEach((o) => suma(o.dueno_comercial_id, "leads"));
  historial
    .filter(
      (h) =>
        h.oportunidad?.pipeline === "ventas" &&
        h.etapa_nueva === "Contacto efectivo" &&
        enMes(h.fecha, anioMes)
    )
    .forEach((h) => suma(h.oportunidad?.dueno_comercial_id ?? null, "contactos"));
  historial
    .filter(
      (h) =>
        h.oportunidad?.pipeline === "ventas" &&
        h.etapa_nueva === "Cotización enviada" &&
        enMes(h.fecha, anioMes)
    )
    .forEach((h) => suma(h.oportunidad?.dueno_comercial_id ?? null, "cotizaciones"));
  historial
    .filter(
      (h) =>
        h.oportunidad?.pipeline === "licitaciones" &&
        h.etapa_nueva === "Propuesta técnica y económica" &&
        enMes(h.fecha, anioMes)
    )
    .forEach((h) => suma(h.oportunidad?.dueno_comercial_id ?? null, "licitacionesArmadas"));
  historial
    .filter(
      (h) =>
        h.oportunidad?.pipeline === "recuperacion" &&
        h.etapa_nueva === "Contacto de reactivación" &&
        enMes(h.fecha, anioMes)
    )
    .forEach((h) => suma(h.oportunidad?.dueno_comercial_id ?? null, "reactivacionContactos"));
  checkins
    .filter((c) => enMes(c.completada_at, anioMes))
    .forEach((c) => suma(c.dueno_comercial_id, "checkins"));
  ventasCerradasMes.forEach((v) => suma(v.dueno_comercial_id, "cierres"));

  const rankingFilas: FilaRanking[] = Array.from(actividad.entries())
    .map(([id, a]) => ({
      id,
      nombre: id === "sin_asignar" ? "Sin asignar" : nombreVendedor(id),
      ...a,
      total:
        a.leads +
        a.contactos +
        a.cotizaciones +
        a.licitacionesArmadas +
        a.reactivacionContactos +
        a.checkins,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    funnelResultado,
    paresPorVendedor,
    paresPorUnidad,
    totalParesReal,
    totalParesMeta,
    licitacionesParticipadasMes: licitacionesParticipadasMes.length,
    licitacionesAdjudicadasMes: licitacionesAdjudicadasMes.length,
    tasaExitoLicitaciones,
    montoLicitacionesActivas,
    recuperacionPorEtapa,
    reactivadasMes,
    facturacionRecuperada,
    facturacionIdentificada,
    estancadas,
    rankingFilas,
  };
}
