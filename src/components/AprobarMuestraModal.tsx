"use client";

import { useState } from "react";
import { aprobarMuestra, rechazarMuestra } from "@/lib/data/muestras";
import { textoDuracion } from "@/lib/muestras";
import type { Muestra } from "@/lib/types";

const ETIQUETAS: Record<string, string> = {
  giro: "A qué se dedica",
  trabajadores: "Trabajadores con calzado",
  calzado_actual: "Calzado que usa hoy",
  marca_actual: "Marca actual",
  precio_actual: "Precio actual",
  problema: "Problema / por qué evalúa cambiar",
  req_norma: "Norma",
  req_casquillo: "Casquillo",
  req_suela: "Tipo de suela",
  req_material: "Piel o PVC",
  req_ambiente: "Ambiente de trabajo",
  volumen_anual: "Volumen anual (pares)",
  frecuencia: "Frecuencia de compra",
  quien_decide: "Quién decide la compra",
  quien_evalua: "Quién evalúa la muestra",
  competidores: "Competidores",
};

/** Revisión de una solicitud por un Administrador: aprobar (ajustando cantidades) o rechazar con motivo. */
export function AprobarMuestraModal({
  muestra,
  onClose,
  onHecho,
}: {
  muestra: Muestra;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [pares, setPares] = useState<Record<string, string>>(
    Object.fromEntries((muestra.renglones ?? []).map((r) => [r.id, String(r.pares)]))
  );
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(pares).reduce((s, v) => s + (Number(v) || 0), 0);

  async function onAprobar() {
    setError(null);
    if ((muestra.renglones ?? []).some((r) => !(Number(pares[r.id]) > 0))) {
      setError("Cada renglón debe llevar una cantidad mayor a cero.");
      return;
    }
    setGuardando(true);
    try {
      await aprobarMuestra(
        muestra.id,
        (muestra.renglones ?? []).map((r) => ({ id: r.id, pares: Number(pares[r.id]) }))
      );
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aprobar");
      setGuardando(false);
    }
  }

  async function onRechazar() {
    setError(null);
    if (motivo.trim().length < 3) {
      setError("Escribe el motivo del rechazo: el vendedor lo verá en la oportunidad.");
      return;
    }
    setGuardando(true);
    try {
      await rechazarMuestra(muestra.id, motivo);
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo rechazar");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-2xl mx-auto my-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink">Solicitud de muestras — {muestra.cliente?.empresa}</h3>
            <p className="text-xs text-ink-muted">Pide: {muestra.vendedor?.nombre}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted text-sm">
            ✕ Cerrar
          </button>
        </div>

        <section className="rounded-md bg-section p-3 text-sm space-y-1">
          {Object.entries(ETIQUETAS).map(([k, l]) => (
            <p key={k}>
              <span className="text-ink-muted">{l}: </span>
              {muestra.ficha_cliente?.[k] || "—"}
            </p>
          ))}
        </section>

        <section className="text-sm space-y-1">
          <p>
            <strong>Por qué son necesarias:</strong> {muestra.justificacion_necesidad}
          </p>
          <p>
            <strong>Por qué esos modelos y cantidad:</strong> {muestra.justificacion_modelos}
          </p>
          <p>
            <strong>Prueba propuesta:</strong> {textoDuracion(muestra.prueba_valor, muestra.prueba_unidad)}
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold text-ink">Renglones (puedes ajustar la cantidad)</p>
          {(muestra.renglones ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {r.estilo} · {r.linea}
                {r.talla ? ` · talla ${r.talla}` : ""}
                <span className="text-xs text-ink-muted"> (pidió {r.pares_solicitados})</span>
              </span>
              <input
                type="number"
                min={1}
                className="w-20 border border-line bg-card text-ink rounded-md px-2 py-1 text-sm font-num text-right"
                value={pares[r.id] ?? ""}
                onChange={(e) => setPares((p) => ({ ...p, [r.id]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-sm text-ink-muted">
            Total a aprobar: <strong className="font-num text-ink">{total}</strong> pares
          </p>
        </section>

        {rechazando && (
          <label className="block text-sm">
            <span className="block text-ink-muted mb-1">Motivo del rechazo (obligatorio)</span>
            <textarea
              rows={2}
              autoFocus
              className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 flex-wrap">
          {!rechazando ? (
            <>
              <button
                onClick={onAprobar}
                disabled={guardando}
                className="bg-green-600 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Aprobar"}
              </button>
              <button
                onClick={() => setRechazando(true)}
                disabled={guardando}
                className="rounded-md px-4 py-2 text-sm border border-red-300 text-red-700"
              >
                Rechazar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onRechazar}
                disabled={guardando}
                className="bg-red-600 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Confirmar rechazo"}
              </button>
              <button onClick={() => setRechazando(false)} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
                Volver
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
