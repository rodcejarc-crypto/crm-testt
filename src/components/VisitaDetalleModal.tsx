"use client";

import { useEffect, useState } from "react";
import {
  borrarEvidencia,
  ligarVisita,
  listarEvidencia,
  marcarVisitaRealizada,
  subirEvidencia,
  urlEvidencia,
  type ArchivoEvidencia,
} from "@/lib/data/visitas";
import { SelectorClienteOportunidad, type ClienteElegido } from "@/components/SelectorClienteOportunidad";
import { PIPELINES } from "@/lib/pipelines/config";
import type { Visita } from "@/lib/types";

const MSJ_SIN_EVIDENCIA = "Sube la foto o evidencia antes de marcarla como realizada.";

export function VisitaDetalleModal({
  visita,
  onClose,
  onCambio,
}: {
  visita: Visita;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [archivos, setArchivos] = useState<ArchivoEvidencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [notas, setNotas] = useState(visita.notas || "");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ligar una visita vieja (sin cliente) a un cliente / oportunidad.
  const [ligando, setLigando] = useState(false);
  const [clienteLigar, setClienteLigar] = useState<ClienteElegido | null>(null);
  const [oportunidadLigar, setOportunidadLigar] = useState<string | null>(null);
  const [guardandoLigar, setGuardandoLigar] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setArchivos(await listarEvidencia(visita.id));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita.id]);

  async function onSubirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      await subirEvidencia(visita.id, file);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
      e.target.value = "";
    }
  }

  async function onVer(path: string) {
    const url = await urlEvidencia(path);
    if (url) window.open(url, "_blank");
  }

  async function onBorrar(path: string) {
    await borrarEvidencia(path);
    await cargar();
  }

  async function onConfirmarRealizada() {
    if (archivos.length === 0) {
      setError(MSJ_SIN_EVIDENCIA);
      return;
    }
    setConfirmando(true);
    setError(null);
    try {
      await marcarVisitaRealizada(visita.id, notas);
      onCambio();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar como realizada");
    } finally {
      setConfirmando(false);
    }
  }

  async function onGuardarLigar() {
    if (!clienteLigar) return;
    setGuardandoLigar(true);
    setError(null);
    try {
      await ligarVisita(visita.id, clienteLigar.id, oportunidadLigar);
      onCambio();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ligar la visita");
    } finally {
      setGuardandoLigar(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-lg mx-auto space-y-4 my-8">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink">
              Visita — {new Date(visita.fecha + "T00:00:00").toLocaleDateString("es-MX")}
            </h3>
            <p className="text-sm text-ink-muted">
              {visita.vendedor?.nombre}
              {visita.realizada_para_id !== visita.vendedor_id &&
                ` → apoyando a ${visita.realizada_para?.nombre}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-ink-muted text-sm">
            ✕ Cerrar
          </button>
        </div>

        {/* Cliente y oportunidad ligados */}
        <div className="rounded-md border border-line bg-section/50 p-3 text-sm">
          {visita.cliente ? (
            <>
              <p>
                <span className="text-ink-muted">Cliente: </span>
                <strong className="text-ink">{visita.cliente.empresa}</strong>
              </p>
              <p>
                <span className="text-ink-muted">Oportunidad: </span>
                {visita.oportunidad
                  ? `${PIPELINES[visita.oportunidad.pipeline].label} — ${visita.oportunidad.etapa}`
                  : "Sin oportunidad"}
              </p>
            </>
          ) : (
            <p className="text-ink-muted">Esta visita no está ligada a ningún cliente.</p>
          )}
        </div>

        {!visita.cliente && visita.estado !== "realizada" && (
          <div className="space-y-2">
            {!ligando ? (
              <button
                onClick={() => setLigando(true)}
                className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink"
              >
                Ligar a cliente / oportunidad
              </button>
            ) : (
              <div className="rounded-md border border-line p-3 space-y-3">
                <SelectorClienteOportunidad
                  cliente={clienteLigar}
                  oportunidadId={oportunidadLigar}
                  onChange={(c, o) => {
                    setClienteLigar(c);
                    setOportunidadLigar(o);
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={onGuardarLigar}
                    disabled={!clienteLigar || guardandoLigar}
                    className="bg-brand text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
                  >
                    {guardandoLigar ? "Guardando..." : "Guardar"}
                  </button>
                  <button
                    onClick={() => setLigando(false)}
                    className="text-sm px-4 py-1.5 rounded-md border border-line"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <label className="block">
          <span className="block text-sm font-medium text-ink-muted mb-1">Nota / reporte</span>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            disabled={visita.estado === "realizada"}
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-muted">Evidencia</p>
          {cargando ? (
            <p className="text-sm text-ink-muted">Cargando...</p>
          ) : archivos.length === 0 ? (
            <p className="text-sm text-ink-muted">Todavía no hay archivos.</p>
          ) : (
            <ul className="space-y-1">
              {archivos.map((a) => (
                <li key={a.path} className="flex items-center justify-between text-sm">
                  <button onClick={() => onVer(a.path)} className="text-brand underline truncate">
                    {a.name}
                  </button>
                  {visita.estado !== "realizada" && (
                    <button onClick={() => onBorrar(a.path)} className="text-xs text-red-600 underline ml-2">
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {visita.estado !== "realizada" && (
            <label className="inline-block text-sm px-3 py-1.5 rounded-md border border-line cursor-pointer">
              {subiendo ? "Subiendo..." : "+ Subir foto / archivo"}
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={onSubirArchivo}
                disabled={subiendo}
              />
            </label>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {visita.estado === "realizada" ? (
          <p className="text-sm text-green-700">✅ Visita realizada.</p>
        ) : (
          <div className="space-y-1">
            <button
              onClick={onConfirmarRealizada}
              disabled={confirmando}
              className="bg-green-600 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
            >
              {confirmando ? "Guardando..." : "Marcar como realizada"}
            </button>
            {visita.oportunidad_id && (
              <p className="text-xs text-ink-muted">
                Al marcarla realizada se registra un seguimiento hecho en la oportunidad.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
