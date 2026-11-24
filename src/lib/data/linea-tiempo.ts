import { createClient } from "@/lib/supabase/client";

export type TipoEvento = "oportunidad" | "etapa" | "seguimiento" | "comentario" | "visita" | "muestra" | "llamada";

export interface EventoLinea {
  id: string;
  fecha: string;
  tipo: TipoEvento;
  titulo: string;
  detalle?: string | null;
  autor?: string | null;
  /** A qué oportunidad pertenece (para mostrar su etiqueta y el enlace). */
  oportunidadId?: string;
}

const RESULTADO_LLAMADA: Record<string, string> = {
  contesto_interesado: "Contestó y le interesa",
  contesto_no_interesa: "Contestó y no le interesa",
  no_contesto: "No contestó",
  numero_equivocado: "Número equivocado",
  llamar_despues: "Pidió que le llamen después",
  misma_razon_social: "Ya se trabaja con otra razón social",
  gestion_activa: "Ya tiene gestión activa",
  no_apto: "No apto para Rhinoboots (descartado)",
  otro: "Otro",
};

const ESTADO_MUESTRA: Record<string, string> = {
  solicitada: "solicitada",
  aprobada: "aprobada",
  rechazada: "rechazada",
  entregada: "entregada",
  en_prueba: "en prueba",
  evaluada: "evaluada",
  cerrada: "cerrada",
};

/**
 * Todo lo que ha pasado en una o varias oportunidades (etapas, seguimientos,
 * comentarios, visitas y muestras) y, si se da el cliente, sus llamadas de cartera.
 * Se lee con los permisos de quien la consulta.
 */
export async function cargarLineaTiempo(
  oportunidades: { id: string; created_at: string; etiqueta: string }[],
  clienteId?: string
): Promise<EventoLinea[]> {
  const supabase = createClient();
  const ids = oportunidades.map((o) => o.id);
  const eventos: EventoLinea[] = [];

  for (const o of oportunidades) {
    eventos.push({
      id: `op-${o.id}`,
      fecha: o.created_at,
      tipo: "oportunidad",
      titulo: `Se creó la oportunidad: ${o.etiqueta}`,
      oportunidadId: o.id,
    });
  }

  if (ids.length > 0) {
    const [hist, tareas, coms, visitas, muestras] = await Promise.all([
      supabase.from("oportunidad_historial").select("id, oportunidad_id, etapa_anterior, etapa_nueva, nota, fecha").in("oportunidad_id", ids),
      supabase
        .from("tareas")
        .select("id, oportunidad_id, titulo, estado, completada_at, fecha_vencimiento, nota, motivo_cierre, muestra_id")
        .in("oportunidad_id", ids),
      supabase.from("comentarios").select("id, oportunidad_id, texto, creado_en, autor:vendedores(nombre)").in("oportunidad_id", ids),
      supabase.from("visitas").select("id, oportunidad_id, fecha, estado, notas, vendedor:vendedores!visitas_vendedor_id_fkey(nombre)").in("oportunidad_id", ids),
      supabase.from("muestras").select("id, oportunidad_id, estado, creado_en").in("oportunidad_id", ids),
    ]);

    for (const h of hist.data ?? []) {
      eventos.push({
        id: `h-${h.id}`,
        fecha: h.fecha,
        tipo: "etapa",
        titulo: h.etapa_anterior ? `Etapa: ${h.etapa_anterior} → ${h.etapa_nueva}` : `Etapa: ${h.etapa_nueva}`,
        detalle: h.nota,
        oportunidadId: h.oportunidad_id,
      });
    }
    for (const t of tareas.data ?? []) {
      const hecho = t.estado === "completada";
      const cerradaReact = t.estado === "cancelada" && t.motivo_cierre === "reactivacion";
      const estado = hecho ? "hecho" : cerradaReact ? "cerrado por reactivación" : t.estado === "cancelada" ? "cancelado" : "pendiente";
      eventos.push({
        id: `t-${t.id}`,
        fecha: t.completada_at ?? `${t.fecha_vencimiento}T12:00:00`,
        tipo: "seguimiento",
        titulo: `${t.muestra_id ? "Prueba de muestra" : "Seguimiento"}: ${t.titulo} (${estado})`,
        detalle: t.nota,
        oportunidadId: t.oportunidad_id ?? undefined,
      });
    }
    for (const c of (coms.data ?? []) as unknown as { id: string; oportunidad_id: string; texto: string; creado_en: string; autor: { nombre: string } | null }[]) {
      eventos.push({
        id: `c-${c.id}`,
        fecha: c.creado_en,
        tipo: "comentario",
        titulo: "Comentario",
        detalle: c.texto,
        autor: c.autor?.nombre ?? null,
        oportunidadId: c.oportunidad_id,
      });
    }
    for (const v of (visitas.data ?? []) as unknown as { id: string; oportunidad_id: string; fecha: string; estado: string; notas: string | null; vendedor: { nombre: string } | null }[]) {
      eventos.push({
        id: `v-${v.id}`,
        fecha: `${v.fecha}T12:00:00`,
        tipo: "visita",
        titulo: `Visita (${v.estado})`,
        detalle: v.notas,
        autor: v.vendedor?.nombre ?? null,
        oportunidadId: v.oportunidad_id,
      });
    }
    for (const m of muestras.data ?? []) {
      eventos.push({
        id: `m-${m.id}`,
        fecha: m.creado_en,
        tipo: "muestra",
        titulo: `Muestra: ${ESTADO_MUESTRA[m.estado] ?? m.estado}`,
        oportunidadId: m.oportunidad_id,
      });
    }
  }

  if (clienteId) {
    const { data: llamadas } = await supabase
      .from("llamadas")
      .select("id, resultado, nota, creado_en, vendedor:vendedores!llamadas_vendedor_id_fkey(nombre)")
      .eq("cliente_id", clienteId);
    const { data: eventosCliente } = await supabase
      .from("cliente_eventos")
      .select("id, tipo, detalle, creado_en, por:vendedores(nombre)")
      .eq("cliente_id", clienteId);
    for (const e of (eventosCliente ?? []) as unknown as { id: string; tipo: string; detalle: string | null; creado_en: string; por: { nombre: string } | null }[]) {
      eventos.push({
        id: `ce-${e.id}`,
        fecha: e.creado_en,
        tipo: "llamada",
        titulo: e.tipo === "reactivado" ? "Cliente reactivado por la administración" : "Dueño reasignado por la administración",
        detalle: e.detalle,
        autor: e.por?.nombre ?? null,
      });
    }
    for (const l of (llamadas ?? []) as unknown as { id: string; resultado: string; nota: string | null; creado_en: string; vendedor: { nombre: string } | null }[]) {
      eventos.push({
        id: `l-${l.id}`,
        fecha: l.creado_en,
        tipo: "llamada",
        titulo: `Llamada de cartera: ${RESULTADO_LLAMADA[l.resultado] ?? l.resultado}`,
        detalle: l.nota,
        autor: l.vendedor?.nombre ?? null,
      });
    }
  }

  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
