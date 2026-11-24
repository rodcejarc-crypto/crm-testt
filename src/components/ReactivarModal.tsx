"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reactivarCliente } from "@/lib/data/oportunidades";

/**
 * Confirmación para reactivar una cuenta de Recuperación. No borra nada: el
 * historial de recuperación se conserva y se ve en el cliente y en la nueva
 * oportunidad de Ventas.
 */
export function ReactivarModal({
  oportunidadId,
  empresa,
  onCancel,
}: {
  oportunidadId: string;
  empresa: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"Negociación" | "Cerrada Ganada">("Negociación");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReactivar() {
    setGuardando(true);
    setError(null);
    try {
      const nueva = await reactivarCliente(oportunidadId, etapa);
      router.push(`/oportunidades/${nueva}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reactivar");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto space-y-4 my-6">
        <div>
          <h3 className="font-semibold text-ink">Reactivar a {empresa}</h3>
          <p className="text-sm text-ink-muted mt-2">
            El cliente pasará a Activo y se creará una oportunidad en Ventas. Todo el historial de
            recuperación se conserva y se verá en el cliente y en la nueva oportunidad.
          </p>
        </div>

        <fieldset className="space-y-2 text-sm">
          <legend className="text-ink-muted mb-1">¿En qué etapa empieza la oportunidad de Ventas?</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="etapa-reactivar"
              className="mt-1"
              checked={etapa === "Negociación"}
              onChange={() => setEtapa("Negociación")}
            />
            <span>
              <span className="text-ink">Negociación</span>
              <span className="block text-xs text-ink-muted">
                Todavía no hay pedido. Arranca el calendario de seguimientos de Ventas.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="etapa-reactivar"
              className="mt-1"
              checked={etapa === "Cerrada Ganada"}
              onChange={() => setEtapa("Cerrada Ganada")}
            />
            <span>
              <span className="text-ink">Cerrada Ganada</span>
              <span className="block text-xs text-ink-muted">
                Ya hay pedido (necesita los renglones del pedido o el valor). Se registra como venta
                directa.
              </span>
            </span>
          </label>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onReactivar}
            disabled={guardando}
            className="bg-green-600 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Reactivando..." : "Reactivar"}
          </button>
          <button
            onClick={onCancel}
            disabled={guardando}
            className="text-sm px-4 py-2 rounded-md border border-line"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
