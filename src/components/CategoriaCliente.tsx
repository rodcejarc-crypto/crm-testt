"use client";

import { useState } from "react";
import { actualizarCliente } from "@/lib/data/clientes";
import { CATEGORIAS_CLIENTE } from "@/lib/types";
import type { CategoriaCliente as Categoria } from "@/lib/types";

export function CategoriaCliente({
  clienteId,
  categoria,
  onCambio,
}: {
  clienteId: string;
  categoria: Categoria | null;
  onCambio: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(valor: Categoria | null) {
    setGuardando(true);
    setError(null);
    try {
      await actualizarCliente(clienteId, { categoria_cliente: valor });
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-ink">Categoría del cliente</p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS_CLIENTE.map((c) => (
          <button
            key={c}
            onClick={() => elegir(categoria === c ? null : c)}
            disabled={guardando}
            className={`text-sm px-4 py-1.5 rounded-full border disabled:opacity-50 ${
              categoria === c
                ? "bg-brand text-white border-brand"
                : "bg-card text-ink-muted border-line hover:border-ink-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        {categoria
          ? "Pulsa de nuevo la categoría elegida para quitarla."
          : "Aún sin clasificar. Elige si es distribuidor o cliente empresa; puedes ir marcándolos poco a poco."}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
