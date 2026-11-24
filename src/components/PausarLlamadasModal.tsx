"use client";

import { useState } from "react";
import { formatoFecha, hoyTexto, pausarLlamadas, pausarLlamadasTodos } from "@/lib/data/pausas";

/** La administración pausa las llamadas de cartera de un vendedor entre dos fechas (ambas incluidas). */
export function PausarLlamadasModal({
  vendedorId,
  nombre,
  meta,
  todosCantidad,
  onCancel,
  onHecho,
}: {
  vendedorId?: string;
  nombre?: string;
  meta?: number;
  /** Si se da, la pausa es para todos los vendedores con llamadas al día (cuántos son). */
  todosCantidad?: number;
  onCancel: () => void;
  onHecho: () => void | Promise<void>;
}) {
  const paraTodos = todosCantidad !== undefined;
  const hoy = hoyTexto();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [mantener, setMantener] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = desde >= hoy && hasta >= desde && motivo.trim().length >= 3;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      if (paraTodos) {
        const r = await pausarLlamadasTodos(desde, hasta, motivo.trim(), mantener);
        if (r.omitidos > 0) {
          window.alert(`Se pausó a ${r.pausados} vendedores. ${r.omitidos} ya tenían una pausa en esas fechas y no se tocaron.`);
        }
      } else {
        await pausarLlamadas(vendedorId!, desde, hasta, motivo.trim(), mantener);
      }
      await onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la pausa");
      setGuardando(false);
    }
  }

  const campo = "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto space-y-4 my-6">
        <div>
          <h3 className="font-semibold text-ink">
            {paraTodos ? `Pausar llamadas de todos (${todosCantidad} vendedores)` : `Pausar llamadas de ${nombre}`}
          </h3>
          <p className="text-sm text-ink-muted mt-1">
            Durante la pausa no se {paraTodos ? "les cargan" : "le cargan"} clientes nuevos para llamar.{" "}
            {mantener
              ? "Las llamadas que ya tiene pendientes se quedan y las puede seguir gestionando."
              : "Además se ocultan sus llamadas pendientes (quedan canceladas, no se borran) y sus clientes quedan disponibles."}{" "}
            Al terminar la pausa, vuelve solo a sus llamadas al día{paraTodos ? "" : ` (${meta})`}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-ink-muted">
            <span className="block mb-1">Desde</span>
            <input type="date" className={campo} value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="block text-xs text-ink-muted">
            <span className="block mb-1">Hasta (incluido)</span>
            <input type="date" className={campo} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        {valido && (
          <p className="text-xs text-ink-muted">
            En pausa del {formatoFecha(desde)} al {formatoFecha(hasta)}. Vuelve a recibir llamadas el día siguiente.
          </p>
        )}
        <label className="block text-xs text-ink-muted">
          <span className="block mb-1">Motivo (obligatorio)</span>
          <input
            className={campo}
            placeholder="Ej. Otras actividades"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={mantener} onChange={(e) => setMantener(e.target.checked)} />
          <span>
            Mantener visibles las llamadas pendientes <span className="text-ink-muted">(solo no cargar nuevas)</span>
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={guardar}
            disabled={guardando || !valido}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Guardando..." : paraTodos ? "Pausar a todos" : "Pausar llamadas"}
          </button>
          <button onClick={onCancel} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
