"use client";

import { useState } from "react";
import { actualizarCliente } from "@/lib/data/clientes";

export function ComisionistaCliente({
  clienteId,
  comisionista,
  onCambio,
}: {
  clienteId: string;
  comisionista: string | null;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(comisionista ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(valor: string | null) {
    setGuardando(true);
    setError(null);
    try {
      await actualizarCliente(clienteId, { comisionista: valor });
      setEditando(false);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ink">Comisionista</p>
        {!editando && (
          <button
            onClick={() => {
              setNombre(comisionista ?? "");
              setEditando(true);
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink"
          >
            {comisionista ? "Cambiar comisionista" : "Este cliente es de un comisionista"}
          </button>
        )}
      </div>

      {comisionista && !editando && (
        <div className="text-sm space-y-1">
          <p>
            Cliente del comisionista <strong className="text-ink">{comisionista}</strong>
          </p>
          <p className="text-xs text-ink-muted">
            El cliente no es de propiedad del ejecutivo: solo apoya con el trámite operativo.
          </p>
          <button
            onClick={() => guardar(null)}
            disabled={guardando}
            className="text-xs text-ink-muted underline"
          >
            Quitar (ya no es de comisionista)
          </button>
        </div>
      )}

      {!comisionista && !editando && (
        <p className="text-xs text-ink-muted">
          Si este cliente pertenece a un comisionista y tú solo ayudas con el trámite operativo,
          márcalo aquí y escribe el nombre del comisionista.
        </p>
      )}

      {editando && (
        <div className="space-y-2">
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del comisionista"
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => guardar(nombre.trim() || null)}
              disabled={guardando || !nombre.trim()}
              className="bg-brand text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => setEditando(false)}
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
