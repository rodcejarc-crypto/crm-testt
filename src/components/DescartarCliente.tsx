"use client";

import { useState } from "react";
import { descartarCliente, reactivarCliente } from "@/lib/data/clientes";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DescartarCliente({
  clienteId,
  empresa,
  descartado,
  motivoDescarte,
  descartadoEn,
  descartadoPorNombre,
  onCambio,
}: {
  clienteId: string;
  empresa: string;
  descartado: boolean;
  motivoDescarte: string | null;
  descartadoEn: string | null;
  descartadoPorNombre: string | null;
  onCambio: () => void;
}) {
  const { vendedor } = useVendedorActual();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDescartar() {
    if (!motivo.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      await descartarCliente(clienteId, motivo.trim(), vendedor?.id ?? null);
      setAbierto(false);
      setMotivo("");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descartar");
    } finally {
      setGuardando(false);
    }
  }

  async function onReactivar() {
    if (!window.confirm(`¿Reactivar a "${empresa}"? Volverá a aparecer en el listado de Clientes.`))
      return;
    setGuardando(true);
    try {
      await reactivarCliente(clienteId);
      onCambio();
    } finally {
      setGuardando(false);
    }
  }

  if (descartado) {
    return (
      <div className="bg-section border border-line rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-ink">🗂 Cliente descartado</p>
        <p className="text-sm text-ink-muted">
          {descartadoEn ? `El ${formatoFecha(descartadoEn)}` : ""}
          {descartadoPorNombre ? ` por ${descartadoPorNombre}` : ""}. No aparece en el listado de
          Clientes ni en los pipelines.
        </p>
        {motivoDescarte && (
          <p className="text-sm text-ink">
            <strong>Motivo:</strong> {motivoDescarte}
          </p>
        )}
        <button
          onClick={onReactivar}
          disabled={guardando}
          className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink disabled:opacity-50"
        >
          {guardando ? "Reactivando..." : "Reactivar cliente"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ink">Cliente ilocalizable</p>
        {!abierto && (
          <button
            onClick={() => setAbierto(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-red-300 text-red-700 bg-card"
          >
            Descartar de la base
          </button>
        )}
      </div>

      {!abierto && (
        <p className="text-xs text-ink-muted">
          Si no hay forma de contactarlo (no contesta, no se consigue teléfono, ya no existe), lo
          puedes dar de baja aquí. Queda documentado el motivo y sale del listado de Clientes; se
          puede reactivar después si hace falta.
        </p>
      )}

      {abierto && (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. No contesta llamadas ni WhatsApp desde hace 2 meses. No se logró conseguir otro teléfono."
            rows={3}
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          />
          <p className="text-xs text-yellow-800">
            ⚠ Si este cliente tiene alguna oportunidad abierta, se cerrará como perdida (motivo: sin
            respuesta) y sus seguimientos pendientes se cancelarán.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onDescartar}
              disabled={guardando || !motivo.trim()}
              className="bg-red-600 text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {guardando ? "Descartando..." : "Confirmar y descartar"}
            </button>
            <button
              onClick={() => {
                setAbierto(false);
                setMotivo("");
                setError(null);
              }}
              disabled={guardando}
              className="text-sm px-4 py-1.5 rounded-md border border-line"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
