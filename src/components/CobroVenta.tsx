"use client";

import { useState } from "react";
import { actualizarCobro } from "@/lib/data/ventas";
import type { EstadoCobro } from "@/lib/types";

function fechaCorta(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Estado de cobro de una venta: "Pendiente" o "Cobrada" (con la fecha en que
 * se cobró). Se cambia aquí mismo, sin abrir el detalle.
 */
export function CobroVenta({
  ventaId,
  estado,
  fechaCobro,
  onCambio,
}: {
  ventaId: string;
  estado: EstadoCobro;
  fechaCobro: string | null;
  onCambio: (estado: EstadoCobro, fechaCobro: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nuevo, setNuevo] = useState<EstadoCobro>(estado);
  const [fecha, setFecha] = useState(fechaCobro || new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const f = nuevo === "Cobrada" ? fecha || null : null;
    try {
      await actualizarCobro(ventaId, nuevo, f);
      onCambio(nuevo, f);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <button
        onClick={() => {
          setNuevo(estado);
          setFecha(fechaCobro || new Date().toISOString().slice(0, 10));
          setEditando(true);
        }}
        title="Pulsa para cambiar el estado de cobro"
        className={`text-xs px-2 py-1 rounded-full whitespace-nowrap border ${
          estado === "Cobrada"
            ? "bg-green-100 text-green-800 border-green-300"
            : "bg-yellow-50 text-yellow-800 border-yellow-300"
        }`}
      >
        {estado === "Cobrada" ? `✅ Cobrada${fechaCobro ? ` · ${fechaCorta(fechaCobro)}` : ""}` : "⏳ Pendiente de cobro"}
      </button>
    );
  }

  return (
    <div className="space-y-1 min-w-[170px]">
      <select
        className="w-full border border-line bg-card text-ink rounded-md px-2 py-1 text-xs"
        value={nuevo}
        onChange={(e) => setNuevo(e.target.value as EstadoCobro)}
      >
        <option value="Pendiente">Pendiente de cobro</option>
        <option value="Cobrada">Cobrada</option>
      </select>
      {nuevo === "Cobrada" && (
        <input
          type="date"
          className="w-full border border-line bg-card text-ink rounded-md px-2 py-1 text-xs"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-1">
        <button
          onClick={guardar}
          disabled={guardando}
          className="text-xs px-2 py-1 rounded-md bg-brand text-white disabled:opacity-50"
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button onClick={() => setEditando(false)} className="text-xs px-2 py-1 rounded-md border border-line">
          Cancelar
        </button>
      </div>
    </div>
  );
}
