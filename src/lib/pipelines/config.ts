import type { PipelineKey } from "@/lib/types";

// ============================================================================
// Configuración central de los 3 pipelines. Aquí vive el orden de las
// etapas, qué campos son obligatorios antes de avanzar, y los nombres de
// las etapas "terminales" (ganada / perdida) de cada uno.
//
// Regla de validación: para MOVER una tarjeta hacia adelante (a una etapa
// con índice mayor), se revisan los campos obligatorios de TODAS las
// etapas intermedias hasta la etapa destino (incluida). Mover hacia atrás
// nunca se bloquea, por si hay que corregir algo.
// ============================================================================

export interface PipelineConfig {
  label: string;
  descripcion: string;
  etapas: string[];
  etapaGanada: string;
  etapaPerdida: string;
  // etapa -> campos que deben estar llenos para ENTRAR a esa etapa
  camposRequeridos: Record<string, string[]>;
}

export const PIPELINES: Record<PipelineKey, PipelineConfig> = {
  ventas: {
    label: "Ventas",
    descripcion: "Proceso comercial estándar",
    etapas: [
      "Lead generado",
      "Contacto efectivo",
      "Oportunidad calificada",
      "Cotización enviada",
      "Negociación",
      "Cerrada Ganada",
      "Cerrada Perdida",
      "Postventa",
    ],
    etapaGanada: "Cerrada Ganada",
    etapaPerdida: "Cerrada Perdida",
    camposRequeridos: {
      "Cotización enviada": ["valor_estimado"],
    },
  },
  licitaciones: {
    label: "Licitaciones",
    descripcion: "Concursos y licitaciones públicas/privadas",
    etapas: [
      "Identificación",
      "Análisis de bases",
      "Propuesta técnica y económica",
      "Entrega",
      "Evaluación/Fallo",
      "Adjudicada",
      "Perdida",
    ],
    etapaGanada: "Adjudicada",
    etapaPerdida: "Perdida",
    camposRequeridos: {
      "Análisis de bases": [
        "bid_alineacion",
        "bid_capacidad",
        "bid_rentabilidad",
        "bid_probabilidad",
      ],
      "Propuesta técnica y económica": [
        "entidad_convocante",
        "fecha_limite_entrega",
        "monto_estimado",
      ],
      Entrega: ["monto_garantia"],
    },
  },
  recuperacion: {
    label: "Recuperación de cartera",
    descripcion: "Reactivación de cuentas perdidas",
    etapas: [
      "Cuenta perdida identificada",
      "Contacto de reactivación",
      "Motivo diagnosticado",
      "Propuesta de reactivación",
      "Reactivada",
      "Cerrada sin éxito",
    ],
    etapaGanada: "Reactivada",
    etapaPerdida: "Cerrada sin éxito",
    camposRequeridos: {
      "Contacto de reactivación": [
        "motivo_perdida_original",
        "fecha_ultima_compra",
        "facturacion_historica",
      ],
      "Motivo diagnosticado": ["diagnostico"],
    },
  },
};

// Color de encabezado de cada columna del Kanban, por pipeline y etapa.
export const ETAPA_COLOR: Record<PipelineKey, Record<string, string>> = {
  ventas: {
    "Lead generado": "hsl(206 40% 42%)",
    "Contacto efectivo": "hsl(230 30% 46%)",
    "Oportunidad calificada": "hsl(35 68% 42%)",
    "Cotización enviada": "hsl(192 45% 34%)",
    Negociación: "hsl(15 62% 47%)",
    "Cerrada Ganada": "hsl(140 36% 34%)",
    "Cerrada Perdida": "hsl(0 0% 42%)",
    Postventa: "hsl(280 22% 38%)",
  },
  licitaciones: {
    Identificación: "hsl(45 55% 38%)",
    "Análisis de bases": "hsl(35 60% 40%)",
    "Propuesta técnica y económica": "hsl(25 62% 44%)",
    Entrega: "hsl(15 58% 45%)",
    "Evaluación/Fallo": "hsl(350 50% 45%)",
    Adjudicada: "hsl(140 36% 34%)",
    Perdida: "hsl(0 0% 42%)",
  },
  recuperacion: {
    "Cuenta perdida identificada": "hsl(0 40% 46%)",
    "Contacto de reactivación": "hsl(20 45% 46%)",
    "Motivo diagnosticado": "hsl(266 28% 45%)",
    "Propuesta de reactivación": "hsl(210 38% 42%)",
    Reactivada: "hsl(140 36% 34%)",
    "Cerrada sin éxito": "hsl(0 0% 42%)",
  },
};

// Ayuda corta de cada etapa, para que cualquier ejecutivo (incluso uno
// nuevo) sepa qué significa y cuándo mover un cliente ahí. Se muestra en
// el encabezado de cada columna del Kanban. Edítalo aquí — es el único
// lugar donde vive este texto.
export const ETAPA_DESCRIPCION: Record<PipelineKey, Record<string, string>> = {
  ventas: {
    "Lead generado": "Contacto inicial identificado, aún sin acercamiento directo",
    "Contacto efectivo": "Ya hablamos con el cliente y mostró interés real",
    "Oportunidad calificada": "Tiene presupuesto, necesidad y decisión confirmados",
    "Cotización enviada": "Se envió propuesta formal de precio, esperando respuesta",
    Negociación: "Cliente está evaluando condiciones, precio o volumen",
    "Cerrada Ganada": "Venta confirmada y facturada",
    "Cerrada Perdida": "Cliente decidió no comprar o eligió otra opción",
    Postventa: "Venta cerrada, en seguimiento de entrega/satisfacción/recompra",
  },
  licitaciones: {
    Identificación: "Licitación detectada, evaluando si aplicar",
    "Análisis de bases": "Revisando requisitos técnicos y legales de la convocatoria",
    "Propuesta técnica y económica": "Elaborando y armando la propuesta a entregar",
    Entrega: "Propuesta entregada, esperando fecha de fallo",
    "Evaluación/Fallo": "En proceso de evaluación por parte del cliente/gobierno",
    Adjudicada: "Ganamos la licitación",
    Perdida: "No fuimos seleccionados",
  },
  recuperacion: {
    "Cuenta perdida identificada": "Cliente inactivo detectado, sin compras recientes",
    "Contacto de reactivación": "Se hizo el primer acercamiento para reactivar",
    "Motivo diagnosticado": "Ya sabemos por qué dejó de comprar",
    "Propuesta de reactivación": "Se ofreció condición o solución para regresar",
    Reactivada: "Cliente volvió a comprar",
    "Cerrada sin éxito": "No fue posible reactivar al cliente",
  },
};

export const FIELD_LABELS: Record<string, string> = {
  valor_estimado: "Valor estimado",
  entidad_convocante: "Entidad convocante",
  fecha_limite_entrega: "Fecha límite de entrega",
  monto_estimado: "Monto estimado",
  monto_garantia: "Monto de garantía",
  bid_alineacion: "Bid/no-bid: alineación estratégica",
  bid_capacidad: "Bid/no-bid: capacidad de cumplir",
  bid_rentabilidad: "Bid/no-bid: rentabilidad esperada",
  bid_probabilidad: "Bid/no-bid: probabilidad de ganar",
  motivo_perdida_original: "Motivo de la pérdida original",
  fecha_ultima_compra: "Fecha de última compra",
  facturacion_historica: "Facturación histórica",
  diagnostico: "Diagnóstico",
};

export const MOTIVOS_PERDIDA: { value: string; label: string }[] = [
  { value: "precio", label: "Precio" },
  { value: "servicio", label: "Servicio" },
  { value: "cambio_proveedor", label: "Cambio de proveedor" },
  { value: "sin_presupuesto", label: "Sin presupuesto" },
  { value: "sin_respuesta", label: "Sin respuesta" },
  { value: "otro", label: "Otro" },
];

/**
 * Campos obligatorios (acumulados) para poder ENTRAR a `etapaDestino`,
 * viniendo de `etapaOrigen`. Si el destino tiene un índice menor o igual
 * al origen (mover hacia atrás), no exige nada.
 */
export function camposFaltantes(
  pipeline: PipelineKey,
  etapaOrigen: string,
  etapaDestino: string,
  oportunidad: Record<string, unknown>
): string[] {
  const cfg = PIPELINES[pipeline];
  const idxOrigen = cfg.etapas.indexOf(etapaOrigen);
  const idxDestino = cfg.etapas.indexOf(etapaDestino);
  if (idxDestino <= idxOrigen) return [];

  const requeridos = new Set<string>();
  for (let i = 0; i <= idxDestino; i++) {
    const campos = cfg.camposRequeridos[cfg.etapas[i]] ?? [];
    campos.forEach((c) => requeridos.add(c));
  }

  const faltantes: string[] = [];
  requeridos.forEach((campo) => {
    const valor = oportunidad[campo];
    if (valor === null || valor === undefined || valor === "") {
      faltantes.push(campo);
    }
  });
  return faltantes;
}

export function formatoMoneda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(valor);
}
