"use client";

import { useState } from "react";
import { modificarPruebaMuestra } from "@/lib/data/muestras";
import { fechaFinPrueba, formatoFechaCorta, textoDuracion } from "@/lib/muestras";
import type { Muestra, UnidadPrueba } from "@/lib/types";

const inputCls =
  "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand";

/** Extender o acortar la prueba. Motivo obligatorio; queda en el historial de la muestra. */
export function ModificarPruebaModal({
  muestra,
  onClose,
  onHecho,
}: {
  muestra: Muestra;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [valor, setValor] = useState(String(muestra.prueba_valor ?? 30));
  const [unidad, setUnidad] = useState<UnidadPrueba>((muestra.prueba_unidad ?? "dias") as UnidadPrueba);
  const [motivo, setMotivo] = useState("");
  const [agregar, setAgregar] = useState(false);
  const [nombre, setNombre] = useState("Revisión intermedia");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [detalle, setDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nuevaFin =
    muestra.fecha_entrega && Number(valor) > 0 ? fechaFinPrueba(muestra.fecha_entrega, Number(valor), unidad) : null;

  async function onGuardar() {
    setError(null);
    if (!(Number(valor) > 0)) {
      setError("Indica la nueva duración.");
      return;
    }
    if (motivo.trim().length < 3) {
      setError("Escribe el motivo del cambio (es obligatorio).");
      return;
    }
    if (agregar && (!fecha || !nombre.trim())) {
      setError("Para agregar el seguimiento intermedio indica nombre y fecha.");
      return;
    }
    setGuardando(true);
    try {
      await modificarPruebaMuestra({
        muestraId: muestra.id,
        valor: Number(valor),
        unidad,
        motivo,
        nuevoSeguimiento: agregar ? { nombre, fecha, hora, detalle, rol: "extra" } : null,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo modificar la prueba");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto my-6 space-y-4">
        <h3 className="font-semibold text-ink">Modificar prueba</h3>
        <p className="text-sm text-ink-muted">
          Hoy: {textoDuracion(muestra.prueba_valor, muestra.prueba_unidad)} · termina el{" "}
          <strong>{formatoFechaCorta(muestra.fecha_fin_prueba)}</strong>
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            className={`${inputCls} w-28 font-num`}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <select className={`${inputCls} w-40`} value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadPrueba)}>
            <option value="dias">días</option>
            <option value="semanas">semanas</option>
            <option value="meses">meses</option>
          </select>
        </div>
        {nuevaFin && (
          <p className="text-sm">
            La evaluación final se moverá al <strong>{formatoFechaCorta(nuevaFin)}</strong>.
          </p>
        )}
        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">Motivo del cambio (obligatorio)</span>
          <textarea rows={2} className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agregar} onChange={(e) => setAgregar(e.target.checked)} />
          ¿Agregar otro seguimiento intermedio?
        </label>
        {agregar && (
          <div className="rounded-md border border-line p-3 space-y-2">
            <input className={inputCls} placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <div className="flex gap-2">
              <input type="date" className={`${inputCls} w-44`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <input type="time" className={`${inputCls} w-32`} value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <input
              className={inputCls}
              placeholder="¿Qué se va a validar?"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar cambio"}
          </button>
          <button onClick={onClose} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
