"use client";

import { useState } from "react";
import { cambiarMesDeVenta } from "@/lib/data/oportunidades";
import { etiquetaMesDe, opcionesMesVenta } from "@/lib/mes-venta";

/** Solo la administración: en qué mes cuenta una venta ya ganada (Ventas, Dashboard y metas). */
export function MesDeVenta({
  oportunidadId,
  fechaCierre,
  esAdministracion,
  quien,
  onCambiado,
}: {
  oportunidadId: string;
  fechaCierre: string;
  /** La administración puede mover la venta a cualquiera de los dos meses; un vendedor solo del mes actual al anterior. */
  esAdministracion: boolean;
  quien?: string | null;
  onCambiado: () => void | Promise<void>;
}) {
  const opciones = opcionesMesVenta();
  const mesActual = etiquetaMesDe(fechaCierre);
  const [editando, setEditando] = useState(false);
  const [elegida, setElegida] = useState<"actual" | "anterior">("anterior");
  const [guardando, setGuardando] = useState(false);
  const [razon, setRazon] = useState("");
  const [error, setError] = useState<string | null>(null);

  const destino = opciones.find((o) => o.clave === elegida)!;
  const yaCuentaAhi = destino.etiqueta === mesActual;
  // Un vendedor solo puede pasar una venta de este mes al anterior (no deshacerlo ni mover ventas viejas).
  const puedeMover = esAdministracion || mesActual === opciones[0].etiqueta;
  const opcionesVisibles = esAdministracion ? opciones : opciones.filter((o) => o.clave === "anterior");

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await cambiarMesDeVenta(
        oportunidadId,
        destino.fechaCierre(),
        `Mes de la venta cambiado el ${new Date().toLocaleDateString("es-MX")}${quien ? ` por ${quien}` : ""}: de ${mesActual} a ${destino.etiqueta}. Motivo: ${razon.trim()}`
      );
      setEditando(false);
      await onCambiado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el mes");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-ink">
          📅 Esta venta cuenta en <strong>{mesActual}</strong>
        </p>
        {!editando && puedeMover && (
          <button onClick={() => setEditando(true)} className="text-xs px-3 py-1.5 rounded-md border border-line bg-card text-ink">
            Cambiar mes
          </button>
        )}
      </div>
      {editando && (
        <div className="space-y-2">
          <select
            className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
            value={elegida}
            onChange={(e) => setElegida(e.target.value as "actual" | "anterior")}
          >
            {opcionesVisibles.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.etiqueta}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
            placeholder="Motivo (obligatorio). Ej. El pedido se confirmó el 30 y la OC llegó el 2"
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={guardar}
              disabled={guardando || yaCuentaAhi || razon.trim().length < 5}
              className="text-sm px-3 py-1.5 rounded-md bg-brand text-white disabled:opacity-50"
            >
              {guardando ? "Guardando..." : yaCuentaAhi ? "Ya cuenta en ese mes" : "Guardar"}
            </button>
            <button onClick={() => setEditando(false)} disabled={guardando} className="text-sm px-3 py-1.5 rounded-md border border-line">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
