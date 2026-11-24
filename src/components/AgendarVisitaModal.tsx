"use client";

import { useState } from "react";
import { crearVisita } from "@/lib/data/visitas";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { ClienteElegido } from "@/components/SelectorClienteOportunidad";
import { SelectorClienteOportunidad } from "@/components/SelectorClienteOportunidad";

/** Agendar una visita con el cliente y la oportunidad ya elegidos (desde la ficha de la oportunidad). */
export function AgendarVisitaModal({
  cliente,
  oportunidadId,
  onCancel,
  onCreada,
}: {
  cliente: ClienteElegido;
  oportunidadId: string;
  onCancel: () => void;
  onCreada: () => void;
}) {
  const { vendedor } = useVendedorActual();
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAgendar() {
    if (!vendedor) return;
    setGuardando(true);
    setError(null);
    try {
      await crearVisita({
        fecha,
        vendedor_id: vendedor.id,
        realizada_para_id: vendedor.id,
        cliente_id: cliente.id,
        oportunidad_id: oportunidadId,
        notas: notas.trim() || undefined,
      });
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agendar la visita");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto my-6 space-y-4">
        <h3 className="font-semibold text-ink">Agendar visita</h3>
        <SelectorClienteOportunidad
          cliente={cliente}
          oportunidadId={oportunidadId}
          bloqueado
          onChange={() => {}}
        />
        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">Fecha</span>
          <input
            type="date"
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">Nota (opcional)</span>
          <input
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onAgendar}
            disabled={guardando || !fecha}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Agendando..." : "Agendar"}
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
