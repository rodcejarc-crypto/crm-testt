"use client";

import { useEffect, useState } from "react";
import { actualizarCliente } from "@/lib/data/clientes";
import { listarVendedores } from "@/lib/data/vendedores";
import { unidadDe } from "@/lib/unidades";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Vendedor } from "@/lib/types";

/**
 * Solo para administración (admin general o admin de una unidad): reasigna
 * el cliente de un vendedor a otro. Un vendedor normal no ve este bloque.
 * Un admin de unidad solo puede pasarlo a alguien de su propia unidad —
 * la base de datos (RLS) ya lo exige aunque la pantalla se equivoque.
 */
export function ReasignarCliente({
  clienteId,
  duenoActualId,
  duenoActualNombre,
  onCambio,
}: {
  clienteId: string;
  duenoActualId: string | null;
  duenoActualNombre: string | null;
  onCambio: () => void;
}) {
  const { esAdminUnidad, miUnidad } = useVendedorActual();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [nuevoId, setNuevoId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarVendedores()
      .then(setVendedores)
      .catch(() => {});
  }, []);

  const opciones = esAdminUnidad
    ? vendedores.filter((v) => unidadDe(v.unidad_negocio) === miUnidad)
    : vendedores;

  async function onReasignar() {
    if (!nuevoId) return;
    setGuardando(true);
    setError(null);
    try {
      await actualizarCliente(clienteId, { dueno_comercial_id: nuevoId });
      setAbierto(false);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reasignar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ink">
          Dueño comercial: <span className="font-normal">{duenoActualNombre || "Sin asignar"}</span>
        </p>
        {!abierto && (
          <button
            onClick={() => {
              setNuevoId("");
              setError(null);
              setAbierto(true);
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink"
          >
            Reasignar cliente
          </button>
        )}
      </div>

      {abierto && (
        <div className="space-y-2">
          <select
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            value={nuevoId}
            onChange={(e) => setNuevoId(e.target.value)}
          >
            <option value="">Selecciona el nuevo vendedor…</option>
            {opciones
              .filter((v) => v.id !== duenoActualId)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onReasignar}
              disabled={guardando || !nuevoId}
              className="bg-brand text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {guardando ? "Reasignando..." : "Confirmar"}
            </button>
            <button
              onClick={() => setAbierto(false)}
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
