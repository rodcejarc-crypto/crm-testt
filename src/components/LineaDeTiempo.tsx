"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cargarLineaTiempo, type EventoLinea, type TipoEvento } from "@/lib/data/linea-tiempo";

const ICONO: Record<TipoEvento, string> = {
  oportunidad: "📌",
  etapa: "➡️",
  seguimiento: "📞",
  comentario: "💬",
  visita: "🚗",
  muestra: "🧪",
  llamada: "☎️",
};

/**
 * Cronología con TODO lo que pasó en las oportunidades dadas: etapas,
 * seguimientos, comentarios, visitas y muestras (y llamadas si se da el cliente).
 */
export function LineaDeTiempo({
  oportunidades,
  clienteId,
  masRecienteArriba,
  vacio = "Todavía no hay historial.",
}: {
  oportunidades: { id: string; created_at: string; etiqueta: string }[];
  clienteId?: string;
  masRecienteArriba?: boolean;
  vacio?: string;
}) {
  const [eventos, setEventos] = useState<EventoLinea[] | null>(null);
  const clave = oportunidades.map((o) => o.id).join(",");

  useEffect(() => {
    let vigente = true;
    cargarLineaTiempo(oportunidades, clienteId)
      .then((e) => vigente && setEventos(e))
      .catch(() => vigente && setEventos([]));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, clienteId]);

  if (!eventos) return <p className="text-sm text-ink-muted">Cargando historial...</p>;
  if (eventos.length === 0) return <p className="text-sm text-ink-muted">{vacio}</p>;

  const lista = masRecienteArriba ? [...eventos].reverse() : eventos;
  const etiquetaDe = new Map(oportunidades.map((o) => [o.id, o.etiqueta]));

  return (
    <ol className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
      {lista.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="shrink-0">{ICONO[e.tipo]}</span>
          <div className="min-w-0">
            <p className="text-ink">
              <span className="font-num text-xs text-ink-muted mr-2">
                {new Date(e.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {e.titulo}
            </p>
            {e.detalle && <p className="text-xs text-ink-muted whitespace-pre-wrap">{e.detalle}</p>}
            <p className="text-xs text-ink-muted">
              {e.autor && <span>{e.autor}</span>}
              {e.oportunidadId && oportunidades.length > 1 && (
                <>
                  {e.autor ? " · " : ""}
                  <Link href={`/oportunidades/${e.oportunidadId}`} className="underline">
                    {etiquetaDe.get(e.oportunidadId) ?? "Oportunidad"}
                  </Link>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
