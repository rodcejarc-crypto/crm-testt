"use client";

import { etiquetaOrigen } from "@/lib/origen-cliente";
import { useEffect, useState } from "react";
import { MOTIVOS_NO_APTO, RESULTADO_LLAMADA } from "@/lib/data/llamadas";
import { buscarClientesGlobal } from "@/lib/data/clientes";
import { listarOportunidadesPorCliente } from "@/lib/data/oportunidades";
import { listarVendedores } from "@/lib/data/vendedores";
import { PIPELINES } from "@/lib/pipelines/config";
import type { ClienteBusquedaGlobal, Oportunidad, ResultadoLlamada, Vendedor } from "@/lib/types";

export interface DatosLlamada {
  resultado: ResultadoLlamada;
  nota: string;
  fecha: string | null;
  hora: string | null;
  clienteRelacionadoId?: string | null;
  vendedorId?: string | null;
  oportunidadGestionId?: string | null;
  motivo?: string | null;
}

const NOTA_OBLIGATORIA: ResultadoLlamada[] = ["misma_razon_social", "gestion_activa", "no_apto", "otro"];

export function RegistrarLlamadaModal({
  clienteId,
  empresa,
  contacto,
  telefono,
  email,
  observaciones,
  origen,
  onCancel,
  onConfirm,
}: {
  clienteId: string | null;
  empresa: string;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  /** Datos del prospecto (listas nuevas): se muestran para que el vendedor llame con contexto. */
  observaciones?: string | null;
  origen?: string | null;
  onCancel: () => void;
  onConfirm: (datos: DatosLlamada) => Promise<void>;
}) {
  const [resultado, setResultado] = useState<ResultadoLlamada | "">("");
  const [nota, setNota] = useState("");
  const [cuando, setCuando] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Misma razón social
  const [busqueda, setBusqueda] = useState("");
  const [encontrados, setEncontrados] = useState<ClienteBusquedaGlobal[]>([]);
  const [elegido, setElegido] = useState<ClienteBusquedaGlobal | null>(null);

  // Gestión activa
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState("");
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [oportunidadId, setOportunidadId] = useState("");

  // No apto
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (resultado !== "misma_razon_social" || elegido) return;
    const t = setTimeout(() => {
      if (busqueda.trim().length < 3) {
        setEncontrados([]);
        return;
      }
      buscarClientesGlobal(busqueda)
        .then((rs) => setEncontrados(rs.filter((r) => r.id !== clienteId).slice(0, 8)))
        .catch(() => setEncontrados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, resultado, elegido, clienteId]);

  useEffect(() => {
    if (resultado !== "gestion_activa") return;
    listarVendedores().then(setVendedores).catch(() => {});
    if (clienteId) {
      listarOportunidadesPorCliente(clienteId)
        .then((ops) => setOportunidades(ops.filter((o) => o.estado_cierre === "abierta")))
        .catch(() => setOportunidades([]));
    }
  }, [resultado, clienteId]);

  const notaObligatoria = resultado !== "" && NOTA_OBLIGATORIA.includes(resultado);

  async function onGuardar() {
    if (!resultado) {
      setError("Elige qué pasó con la llamada.");
      return;
    }
    if (notaObligatoria && nota.trim().length < 3) {
      setError("Escribe un comentario: es obligatorio en esta opción.");
      return;
    }
    if (resultado === "llamar_despues" && !cuando) {
      setError("Indica cuándo pidió que le llamen.");
      return;
    }
    if (resultado === "misma_razon_social" && !elegido) {
      setError("Busca y elige la razón social con la que sí se trabaja.");
      return;
    }
    if (resultado === "gestion_activa" && !vendedorId) {
      setError("Indica quién lo trabaja.");
      return;
    }
    if (resultado === "no_apto" && !motivo) {
      setError("Elige el motivo por el que no es apto.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const [fecha, hora] = cuando ? cuando.split("T") : [null, null];
      await onConfirm({
        resultado,
        nota: nota.trim(),
        fecha: fecha || null,
        hora: hora || null,
        clienteRelacionadoId: resultado === "misma_razon_social" ? elegido?.id : null,
        vendedorId: resultado === "gestion_activa" ? vendedorId : null,
        oportunidadGestionId: resultado === "gestion_activa" ? oportunidadId || null : null,
        motivo: resultado === "no_apto" ? motivo : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  const input =
    "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto space-y-4 my-6">
        <div>
          <h3 className="font-semibold text-ink">📞 Llamada a {empresa}</h3>
          <div className="text-sm text-ink-muted mt-1 space-y-0.5">
            {contacto && <p>Contacto: {contacto}</p>}
            {telefono ? (
              <p>
                Teléfono:{" "}
                <a href={`tel:${telefono}`} className="text-brand underline font-num">
                  {telefono}
                </a>
              </p>
            ) : null}
            {email ? (
              <p>
                Correo:{" "}
                <a href={`mailto:${email}`} className="text-brand underline">
                  {email}
                </a>
              </p>
            ) : null}
            {!telefono && !email && <p>Este cliente no tiene teléfono ni correo guardado.</p>}
          </div>
          {etiquetaOrigen(origen) && (
            <p className="mt-2 text-xs inline-block px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300">
              {etiquetaOrigen(origen)}
            </p>
          )}
          {observaciones && (
            <p className="mt-2 text-xs text-ink-muted whitespace-pre-line max-h-40 overflow-y-auto rounded-md bg-section p-2">
              {observaciones}
            </p>
          )}
        </div>

        <fieldset className="space-y-2 text-sm">
          <legend className="text-ink-muted mb-1">¿Qué pasó con la llamada?</legend>
          {(Object.keys(RESULTADO_LLAMADA) as ResultadoLlamada[]).map((k) => (
            <label key={k} className="flex items-start gap-2">
              <input
                type="radio"
                name="resultado-llamada"
                className="mt-1"
                checked={resultado === k}
                onChange={() => {
                  setResultado(k);
                  setError(null);
                }}
              />
              <span>
                <span className="text-ink">{RESULTADO_LLAMADA[k].label}</span>
                <span className="block text-xs text-ink-muted">{RESULTADO_LLAMADA[k].ayuda}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {resultado === "llamar_despues" && (
          <label className="block text-sm">
            <span className="block text-ink-muted mb-1">¿Cuándo le llamamos?</span>
            <input type="datetime-local" className={input} value={cuando} onChange={(e) => setCuando(e.target.value)} />
          </label>
        )}

        {resultado === "misma_razon_social" && (
          <div className="text-sm space-y-2">
            <span className="block text-ink-muted">¿Con qué razón social sí se trabaja? (nombre o RFC)</span>
            {elegido ? (
              <div className="flex items-center justify-between rounded-md border border-line bg-section/50 px-3 py-2">
                <span className="text-ink">
                  {elegido.empresa}
                  {elegido.rfc ? ` · ${elegido.rfc}` : ""}
                  {elegido.dueno_nombre ? ` · de ${elegido.dueno_nombre}` : ""}
                </span>
                <button onClick={() => setElegido(null)} className="text-xs text-brand underline ml-2">
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <input
                  className={input}
                  placeholder="Escribe al menos 3 letras..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                {encontrados.length > 0 && (
                  <ul className="rounded-md border border-line divide-y max-h-48 overflow-y-auto">
                    {encontrados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setElegido(c)}
                          className="w-full text-left px-3 py-2 hover:bg-section"
                        >
                          <span className="text-ink">{c.empresa}</span>
                          <span className="block text-xs text-ink-muted">
                            {[c.rfc, c.ciudad, c.dueno_nombre ? `de ${c.dueno_nombre}` : null].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {resultado === "gestion_activa" && (
          <div className="text-sm space-y-3">
            <label className="block">
              <span className="block text-ink-muted mb-1">¿Quién lo trabaja?</span>
              <select className={input} value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                <option value="">Elige al vendedor...</option>
                {vendedores
                  .filter((v) => v.activo)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
              </select>
            </label>
            {oportunidades.length > 0 && (
              <label className="block">
                <span className="block text-ink-muted mb-1">Oportunidad abierta (si existe)</span>
                <select className={input} value={oportunidadId} onChange={(e) => setOportunidadId(e.target.value)}>
                  <option value="">Ninguna / no sé</option>
                  {oportunidades.map((o) => (
                    <option key={o.id} value={o.id}>
                      {PIPELINES[o.pipeline].label} — {o.etapa}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {resultado === "no_apto" && (
          <label className="block text-sm">
            <span className="block text-ink-muted mb-1">Motivo</span>
            <select className={input} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Elige el motivo...</option>
              {MOTIVOS_NO_APTO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm">
          <span className="block text-ink-muted mb-1">
            {notaObligatoria ? "Comentario (obligatorio)" : "Comentario (opcional): qué dijo, qué necesita"}
          </span>
          <textarea rows={3} className={input} value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>

        {resultado === "no_apto" && (
          <p className="rounded-md bg-yellow-50 border border-yellow-300 p-2 text-xs text-yellow-900">
            El cliente queda descartado: no volverá a salir en llamadas ni en recuperación. Su historial
            (ventas, facturas, oportunidades) no se borra.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar llamada"}
          </button>
          <button onClick={onCancel} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
