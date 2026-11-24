"use client";

import { useState } from "react";
import { formatoMoneda } from "@/lib/pipelines/config";
import { DIAS_PARA_MES_ANTERIOR, opcionesMesVenta } from "@/lib/mes-venta";

export function CerrarGanadaModal({
  titulo = "🎉 Cerrar como ganada",
  mostrarContexto = false,
  resumenPartidas,
  puedeElegirMes = false,
  quien,
  onConfirm,
  onCancel,
}: {
  titulo?: string;
  /** Muestra el campo "Contexto de meta" (para vendedores con más de una meta el mismo mes, ej. Nayeli B2B/Tienda). */
  mostrarContexto?: boolean;
  /** Si la oportunidad ya tiene renglones (estilos), los pares y el total salen de ahí. */
  resumenPartidas?: { n: number; pares: number; plantillas?: number; monto: number } | null;
  /** Permite que la venta cuente en el mes anterior (administración siempre; vendedores, en los primeros días del mes). */
  puedeElegirMes?: boolean;
  /** Quién cierra la venta (queda en la nota). */
  quien?: string | null;
  /** `fechaCierre` y `notaMes` solo vienen cuando se eligió el mes anterior. */
  onConfirm: (paresVendidos: number, contextoMeta: string | null, fechaCierre: string | null, notaMes: string | null) => void;
  onCancel: () => void;
}) {
  const [pares, setPares] = useState("");
  const [contexto, setContexto] = useState("");
  const opciones = opcionesMesVenta();
  const [mes, setMes] = useState<"actual" | "anterior">("actual");
  const [razon, setRazon] = useState("");
  const conPartidas = !!resumenPartidas && resumenPartidas.n > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg p-5 w-full max-w-sm space-y-4">
        <h3 className="font-semibold text-ink">{titulo}</h3>
        {conPartidas ? (
          <div className="rounded-md border border-line bg-section p-3 text-sm space-y-1">
            <p className="text-ink-muted">Sale de los renglones del pedido:</p>
            <p className="font-num font-semibold text-ink">
              {resumenPartidas!.pares.toLocaleString("es-MX")} pares
              {resumenPartidas!.plantillas
                ? ` + ${resumenPartidas!.plantillas.toLocaleString("es-MX")} plantillas`
                : ""}{" "}
              · {formatoMoneda(resumenPartidas!.monto)}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              ¿Cuántos pares se vendieron? Queda registrado automáticamente en la
              pestaña Ventas.
            </p>
            <input
              type="number"
              min={0}
              autoFocus
              className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
              placeholder="Pares vendidos"
              value={pares}
              onChange={(e) => setPares(e.target.value)}
            />
          </>
        )}
        {mostrarContexto && (
          <label className="block">
            <span className="block text-xs text-ink-muted mb-1">
              Contexto de meta (ej. B2B o Tienda) — déjalo vacío si no aplica
            </span>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Ej. B2B"
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
            />
          </label>
        )}
        {puedeElegirMes && (
          <label className="block">
            <span className="block text-xs text-ink-muted mb-1">¿En qué mes cuenta esta venta?</span>
            <select
              className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
              value={mes}
              onChange={(e) => setMes(e.target.value as "actual" | "anterior")}
            >
              {opciones.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.etiqueta}
                  {o.clave === "actual" ? " (este mes)" : ""}
                </option>
              ))}
            </select>
            {mes === "anterior" && (
              <span className="block text-xs text-amber-700 mt-1">
                La venta se cierra hoy pero contará en {opciones[1].etiqueta} (Ventas, Dashboard y metas). Queda registrado
                quién lo hizo y el motivo.
              </span>
            )}
            <span className="block text-xs text-ink-muted mt-1">
              Los vendedores pueden hacerlo durante los primeros {DIAS_PARA_MES_ANTERIOR} días del mes.
            </span>
          </label>
        )}
        {puedeElegirMes && mes === "anterior" && (
          <label className="block">
            <span className="block text-xs text-ink-muted mb-1">
              Motivo (obligatorio): ¿por qué no se alcanzó a cerrar en {opciones[1].etiqueta}?
            </span>
            <textarea
              rows={2}
              className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
              placeholder="Ej. El cliente confirmó el pedido el 30, la OC llegó el 2"
              value={razon}
              onChange={(e) => setRazon(e.target.value)}
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm px-3 py-1.5 rounded-md border border-line"
          >
            Cancelar
          </button>
          <button
            disabled={
              (!conPartidas && (!pares || Number(pares) < 0)) ||
              (puedeElegirMes && mes === "anterior" && razon.trim().length < 5)
            }
            onClick={() => {
              const anterior = puedeElegirMes && mes === "anterior";
              onConfirm(
                conPartidas ? resumenPartidas!.pares : Number(pares),
                contexto.trim() || null,
                anterior ? opciones[1].fechaCierre() : null,
                anterior
                  ? `Cierre registrado el ${new Date().toLocaleDateString("es-MX")}${quien ? ` por ${quien}` : ""}; cuenta en ${opciones[1].etiqueta}. Motivo: ${razon.trim()}`
                  : null
              );
            }}
            className="text-sm px-3 py-1.5 rounded-md bg-green-600 text-white disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
