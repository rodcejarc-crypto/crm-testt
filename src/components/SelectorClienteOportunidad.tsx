"use client";

import { useEffect, useState } from "react";
import { buscarClientesRapido } from "@/lib/data/clientes";
import { listarOportunidadesPorCliente } from "@/lib/data/oportunidades";
import { PIPELINES } from "@/lib/pipelines/config";
import type { Oportunidad } from "@/lib/types";

export interface ClienteElegido {
  id: string;
  empresa: string;
}

/**
 * Buscador de cliente (por nombre o RFC) + selector opcional de sus
 * oportunidades abiertas. Con `bloqueado` el cliente y la oportunidad ya
 * vienen elegidos y no se pueden cambiar (p. ej. desde la ficha de la oportunidad).
 */
export function SelectorClienteOportunidad({
  cliente,
  oportunidadId,
  bloqueado,
  onChange,
}: {
  cliente: ClienteElegido | null;
  oportunidadId: string | null;
  bloqueado?: boolean;
  onChange: (cliente: ClienteElegido | null, oportunidadId: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<
    { id: string; empresa: string; rfc: string | null; ciudad: string | null }[]
  >([]);
  const [abiertas, setAbiertas] = useState<Oportunidad[]>([]);

  // Búsqueda con pequeña espera mientras se escribe.
  useEffect(() => {
    if (cliente) return;
    const t = setTimeout(() => {
      buscarClientesRapido(texto)
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [texto, cliente]);

  // Oportunidades abiertas del cliente elegido.
  const clienteId = cliente?.id ?? null;
  useEffect(() => {
    if (!clienteId) return;
    let activo = true;
    listarOportunidadesPorCliente(clienteId)
      .then((ops) => {
        if (activo) setAbiertas(ops.filter((o) => o.estado_cierre === "abierta"));
      })
      .catch(() => {
        if (activo) setAbiertas([]);
      });
    return () => {
      activo = false;
    };
  }, [clienteId]);

  const inputCls =
    "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand";

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-sm text-ink-muted mb-1">Cliente (obligatorio)</span>
        {cliente ? (
          <div className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2 bg-section/50">
            <strong className="text-sm text-ink">{cliente.empresa}</strong>
            {!bloqueado && (
              <button
                type="button"
                onClick={() => {
                  setTexto("");
                  setResultados([]);
                  setAbiertas([]);
                  onChange(null, null);
                }}
                className="text-xs text-brand underline"
              >
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <>
            <input
              className={inputCls}
              placeholder="Busca por nombre o RFC (mínimo 2 letras)…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            {texto.trim().length >= 2 && (
              <ul className="mt-1 border border-line rounded-md divide-y divide-line bg-card max-h-48 overflow-y-auto">
                {resultados.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-ink-muted">Sin resultados.</li>
                ) : (
                  resultados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onChange({ id: c.id, empresa: c.empresa }, null)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-section"
                      >
                        {c.empresa}
                        <span className="text-xs text-ink-muted">
                          {c.rfc ? ` · ${c.rfc}` : ""}
                          {c.ciudad ? ` · ${c.ciudad}` : ""}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </>
        )}
      </div>

      {cliente && (
        <label className="block">
          <span className="block text-sm text-ink-muted mb-1">Oportunidad (opcional)</span>
          <select
            className={inputCls}
            value={oportunidadId ?? ""}
            disabled={bloqueado}
            onChange={(e) => onChange(cliente, e.target.value || null)}
          >
            <option value="">Sin oportunidad</option>
            {abiertas.map((o) => (
              <option key={o.id} value={o.id}>
                {PIPELINES[o.pipeline].label} — {o.etapa}
              </option>
            ))}
            {/* Si viene preseleccionada y aún no carga la lista, que no se pierda. */}
            {oportunidadId && !abiertas.some((o) => o.id === oportunidadId) && (
              <option value={oportunidadId}>Oportunidad seleccionada</option>
            )}
          </select>
        </label>
      )}
    </div>
  );
}
