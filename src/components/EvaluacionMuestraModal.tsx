"use client";

import { useState } from "react";
import { evaluarMuestra } from "@/lib/data/muestras";
import { MOTIVOS_RECHAZO_CLIENTE } from "@/lib/muestras";
import type { Muestra } from "@/lib/types";

const inputCls =
  "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand";

/** Evaluación final de la prueba: resultado, comentarios del usuario, motivo y destino de las muestras. */
export function EvaluacionMuestraModal({
  muestra,
  onClose,
  onHecho,
}: {
  muestra: Muestra;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [motivo, setMotivo] = useState("");
  const [devolucion, setDevolucion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGuardar() {
    setError(null);
    if (!resultado) {
      setError("Elige el resultado de la prueba.");
      return;
    }
    if (resultado === "rechazada" && !motivo) {
      setError("Elige el motivo por el que el cliente rechazó la muestra.");
      return;
    }
    if (!devolucion) {
      setError("Indica qué pasa con las muestras: devueltas, se quedan o se cobran.");
      return;
    }
    setGuardando(true);
    try {
      await evaluarMuestra({ muestraId: muestra.id, resultado, comentarios, motivo, devolucion });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la evaluación");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto my-6 space-y-4">
        <div>
          <h3 className="font-semibold text-ink">Evaluación final de la muestra</h3>
          <p className="text-sm text-ink-muted">{muestra.cliente?.empresa}</p>
        </div>

        <fieldset className="space-y-1 text-sm">
          <legend className="text-ink-muted mb-1">Resultado</legend>
          {[
            ["aprobada_cliente", "Aprobada por el cliente"],
            ["rechazada", "Rechazada por el cliente"],
            ["sin_respuesta", "Sin respuesta"],
          ].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="resultado" checked={resultado === v} onChange={() => setResultado(v)} />
              {l}
            </label>
          ))}
        </fieldset>

        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">
            Comentarios de quien probó el calzado (comodidad, durabilidad, ajuste)
          </span>
          <textarea rows={3} className={inputCls} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </label>

        {resultado === "rechazada" && (
          <label className="block text-sm">
            <span className="block text-ink-muted mb-1">Motivo del rechazo (obligatorio)</span>
            <select className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Elige un motivo…</option>
              {MOTIVOS_RECHAZO_CLIENTE.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">¿Qué pasa con las muestras?</span>
          <select className={inputCls} value={devolucion} onChange={(e) => setDevolucion(e.target.value)}>
            <option value="">Elige…</option>
            <option value="se_devuelve">Se devuelven</option>
            <option value="se_queda_sin_costo">Se quedan sin costo</option>
            <option value="se_cobra">Se cobran</option>
          </select>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar evaluación"}
          </button>
          <button onClick={onClose} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
