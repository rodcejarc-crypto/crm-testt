"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearOportunidad } from "@/lib/data/oportunidades";
import { SelectorClienteOportunidad, type ClienteElegido } from "@/components/SelectorClienteOportunidad";

/**
 * Botón "Registrar venta": para el cliente que ya contactó y hizo un pedido.
 * Crea la venta fuera del embudo (sin seguimientos automáticos) y lleva a su
 * ficha para capturar partidas, factura y cerrarla.
 */
export function RegistrarVentaDirecta({
  clienteInicial,
  className,
}: {
  clienteInicial?: ClienteElegido & { dueno_comercial_id?: string | null };
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cliente, setCliente] = useState<ClienteElegido | null>(clienteInicial ?? null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCrear() {
    if (!cliente) {
      setError("Elige el cliente de la venta.");
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const op = await crearOportunidad({
        cliente_id: cliente.id,
        pipeline: "ventas",
        origen: "venta_directa",
        dueno_comercial_id: clienteInicial?.dueno_comercial_id ?? undefined,
      });
      router.push(`/oportunidades/${op.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la venta");
      setCreando(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className={className ?? "bg-brand text-white rounded-md px-4 py-2 text-sm whitespace-nowrap"}
      >
        + Registrar venta
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto space-y-4 my-6">
            <div>
              <h3 className="font-semibold text-ink">Registrar venta directa</h3>
              <p className="text-sm text-ink-muted mt-1">
                Para el cliente que <strong>ya te contactó y te hizo un pedido</strong>. Se captura una
                sola vez (partidas, factura, orden de compra) y no genera seguimientos ni entra al
                embudo. Para un cliente nuevo o que necesita cotización, usa &quot;Nueva oportunidad&quot;.
              </p>
            </div>

            <SelectorClienteOportunidad
              cliente={cliente}
              oportunidadId={null}
              bloqueado={Boolean(clienteInicial)}
              onChange={(c) => setCliente(c)}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onCrear}
                disabled={creando}
                className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
              >
                {creando ? "Creando..." : "Continuar y capturar la venta"}
              </button>
              <button
                onClick={() => setAbierto(false)}
                disabled={creando}
                className="text-sm px-4 py-2 rounded-md border border-line"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
