"use client";

import { useState } from "react";
import { ESTADO_PRUEBA } from "@/lib/muestras";
import { AgendarVisitaModal } from "@/components/AgendarVisitaModal";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { ResultadoPrueba } from "@/lib/types";

/** Datos extra cuando el seguimiento es de una prueba de muestras. */
export interface ContextoMuestra {
  clienteId: string | null;
  clienteEmpresa: string;
  oportunidadId: string;
}

export interface ExtrasRegistro {
  resultadoPrueba?: ResultadoPrueba;
  pasarAEvaluacionFinal?: boolean;
}

export function RegistrarSeguimientoModal({
  titulo,
  empresa,
  detalle,
  muestra,
  onCancel,
  onConfirm,
}: {
  titulo: string;
  empresa: string;
  /** Qué se iba a validar en este seguimiento (si el vendedor lo anotó al programarlo). */
  detalle?: string | null;
  muestra?: ContextoMuestra | null;
  onCancel: () => void;
  onConfirm: (
    nota: string,
    proximaFecha: string | null,
    proximaHora: string | null,
    extras: ExtrasRegistro
  ) => Promise<void>;
}) {
  const { puedeVisitas } = useVendedorActual();
  const [nota, setNota] = useState("");
  const [proximoContacto, setProximoContacto] = useState("");
  const [estadoPrueba, setEstadoPrueba] = useState<ResultadoPrueba | "">("");
  const [pasarAFinal, setPasarAFinal] = useState(true);
  const [agendando, setAgendando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGuardar() {
    if (nota.trim().length < 3) {
      setError("Cuenta qué pasó en este seguimiento — aunque sea una línea.");
      return;
    }
    if (muestra && !estadoPrueba) {
      setError("Indica cómo va la prueba de la muestra.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      let fecha: string | null = null;
      let hora: string | null = null;
      if (proximoContacto) {
        const [f, h] = proximoContacto.split("T");
        fecha = f || null;
        hora = h || null;
      }
      await onConfirm(nota.trim(), fecha, hora, {
        resultadoPrueba: estadoPrueba || undefined,
        pasarAEvaluacionFinal: estadoPrueba === "rechazada" && pasarAFinal,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto space-y-4 my-6">
        <div>
          <h3 className="font-semibold text-ink">{titulo}</h3>
          <p className="text-sm text-ink-muted">{empresa}</p>
          {detalle && <p className="text-xs text-ink-muted mt-1">Por validar: {detalle}</p>}
        </div>

        {muestra && (
          <fieldset className="space-y-1 text-sm">
            <legend className="text-ink-muted mb-1">¿Cómo va la prueba?</legend>
            {(Object.keys(ESTADO_PRUEBA) as ResultadoPrueba[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="estado-prueba" checked={estadoPrueba === k} onChange={() => setEstadoPrueba(k)} />
                {ESTADO_PRUEBA[k].label}
              </label>
            ))}
            {estadoPrueba === "rechazada" && (
              <label className="flex items-center gap-2 mt-2 rounded-md bg-yellow-50 border border-yellow-300 p-2 text-yellow-900">
                <input type="checkbox" checked={pasarAFinal} onChange={(e) => setPasarAFinal(e.target.checked)} />
                Pasar directo a la evaluación final (se cancelan los demás seguimientos de la prueba)
              </label>
            )}
          </fieldset>
        )}

        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">¿Qué pasó? ¿Qué necesita el cliente?</span>
          <textarea
            autoFocus
            rows={4}
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            placeholder="Ej. Habló con el encargado de compras; pidió que le llamemos con la cotización de tallas grandes."
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">
            Próximo contacto (opcional — si el cliente dio fecha y hora)
          </span>
          <input
            type="datetime-local"
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            value={proximoContacto}
            onChange={(e) => setProximoContacto(e.target.value)}
          />
          <span className="block text-xs text-ink-muted mt-1">
            Si lo dejas vacío, este seguimiento simplemente se marca como hecho.
          </span>
        </label>

        {muestra && puedeVisitas && (
          <button
            type="button"
            onClick={() => setAgendando(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink"
          >
            Agendar visita
          </button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar seguimiento"}
          </button>
          <button onClick={onCancel} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>

      {agendando && muestra && muestra.clienteId && (
        <AgendarVisitaModal
          cliente={{ id: muestra.clienteId, empresa: muestra.clienteEmpresa }}
          oportunidadId={muestra.oportunidadId}
          onCancel={() => setAgendando(false)}
          onCreada={() => setAgendando(false)}
        />
      )}
    </div>
  );
}
