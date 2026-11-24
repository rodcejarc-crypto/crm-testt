"use client";

import { useState } from "react";
import { MOTIVOS_PERDIDA } from "@/lib/pipelines/config";
import type { MotivoPerdida } from "@/lib/types";

export function CerrarPerdidaModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (motivo: MotivoPerdida, detalle: string) => void;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoPerdida | "">("");
  const [detalle, setDetalle] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg p-5 w-full max-w-sm space-y-4">
        <h3 className="font-semibold text-ink">Cerrar como perdida</h3>
        <p className="text-sm text-ink-muted">
          Selecciona el motivo. Este dato se guarda permanentemente.
        </p>
        <select
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value as MotivoPerdida)}
        >
          <option value="">Selecciona un motivo...</option>
          {MOTIVOS_PERDIDA.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {motivo === "otro" && (
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Describe el motivo..."
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm px-3 py-1.5 rounded-md border border-line"
          >
            Cancelar
          </button>
          <button
            disabled={!motivo}
            onClick={() => motivo && onConfirm(motivo, detalle)}
            className="text-sm px-3 py-1.5 rounded-md bg-red-600 text-white disabled:opacity-50"
          >
            Confirmar pérdida
          </button>
        </div>
      </div>
    </div>
  );
}
