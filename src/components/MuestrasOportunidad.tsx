"use client";

import { useEffect, useState } from "react";
import { actualizarOportunidad } from "@/lib/data/oportunidades";
import {
  cerrarMuestra,
  listarEvidenciaMuestra,
  listarHistorialMuestra,
  listarMuestrasPorOportunidad,
  urlEvidenciaMuestra,
} from "@/lib/data/muestras";
import { listarTareasPorOportunidad } from "@/lib/data/tareas";
import {
  DEVOLUCION,
  diasRestantes,
  ESTADO_MUESTRA,
  ESTADO_PRUEBA,
  esVencida,
  formatoFechaCorta,
  FORMA_ENTREGA,
  RESULTADO_MUESTRA,
  textoDuracion,
  totalPares,
} from "@/lib/muestras";
import { camposFaltantes, PIPELINES } from "@/lib/pipelines/config";
import { AgendarVisitaModal } from "@/components/AgendarVisitaModal";
import { EntregaMuestraModal } from "@/components/EntregaMuestraModal";
import { EvaluacionMuestraModal } from "@/components/EvaluacionMuestraModal";
import { ModificarPruebaModal } from "@/components/ModificarPruebaModal";
import { SolicitarMuestrasModal } from "@/components/SolicitarMuestrasModal";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Muestra, MuestraHistorial, Oportunidad, Tarea } from "@/lib/types";

interface Archivo {
  nombre: string;
  url: string | null;
  esImagen: boolean;
}

const ES_IMAGEN = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;

export function MuestrasOportunidad({
  oportunidad,
  onOportunidadCambio,
}: {
  oportunidad: Oportunidad;
  /** Se llama cuando la oportunidad cambió (p. ej. pasó a cotización) para recargar la página. */
  onOportunidadCambio: () => void;
}) {
  const { puedeVisitas } = useVendedorActual();
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [evidencia, setEvidencia] = useState<Record<string, Archivo[]>>({});
  const [historial, setHistorial] = useState<Record<string, MuestraHistorial[]>>({});
  const [cargando, setCargando] = useState(true);

  const [solicitando, setSolicitando] = useState(false);
  const [entregando, setEntregando] = useState<Muestra | null>(null);
  const [modificando, setModificando] = useState<Muestra | null>(null);
  const [evaluando, setEvaluando] = useState<Muestra | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [comentarioCierre, setComentarioCierre] = useState<Record<string, string>>({});
  const [etapaDestino, setEtapaDestino] = useState("Cotización enviada");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cliente = oportunidad.cliente ? { id: oportunidad.cliente.id, empresa: oportunidad.cliente.empresa } : null;
  const tieneValor = (oportunidad.valor_estimado ?? oportunidad.monto_estimado ?? 0) > 0;

  async function cargar() {
    const [ms, ts] = await Promise.all([
      listarMuestrasPorOportunidad(oportunidad.id).catch(() => [] as Muestra[]),
      listarTareasPorOportunidad(oportunidad.id).catch(() => [] as Tarea[]),
    ]);
    setMuestras(ms);
    setTareas(ts.filter((t) => t.muestra_id));
    setCargando(false);
    const ev: Record<string, Archivo[]> = {};
    await Promise.all(
      ms
        .filter((m) => m.fecha_entrega)
        .map(async (m) => {
          const archivos = await listarEvidenciaMuestra(m.id).catch(() => []);
          ev[m.id] = await Promise.all(
            archivos.map(async (a) => ({ nombre: a.name, url: await urlEvidenciaMuestra(a.path), esImagen: ES_IMAGEN.test(a.name) }))
          );
        })
    );
    setEvidencia(ev);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidad.id]);

  async function verHistorial(m: Muestra) {
    if (historial[m.id]) {
      setHistorial((p) => {
        const c = { ...p };
        delete c[m.id];
        return c;
      });
      return;
    }
    const h = await listarHistorialMuestra(m.id).catch(() => []);
    setHistorial((p) => ({ ...p, [m.id]: h }));
  }

  async function onCerrar(m: Muestra) {
    setMensaje(null);
    try {
      await cerrarMuestra(m.id, comentarioCierre[m.id] ?? "");
      await cargar();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo cerrar la muestra");
    }
  }

  async function onPasarACotizacion() {
    setMensaje(null);
    const faltan = camposFaltantes(
      oportunidad.pipeline,
      oportunidad.etapa,
      etapaDestino,
      oportunidad as unknown as Record<string, unknown>
    );
    if (faltan.length > 0) {
      setMensaje(
        `Para pasar a "${etapaDestino}" primero captura el valor estimado de la oportunidad (en "Datos de la oportunidad" o en los renglones del pedido).`
      );
      return;
    }
    try {
      await actualizarOportunidad(oportunidad.id, { etapa: etapaDestino });
      onOportunidadCambio();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo mover la oportunidad");
    }
  }

  const puedeSolicitar = oportunidad.estado_cierre === "abierta";
  const etapas = PIPELINES[oportunidad.pipeline].etapas;
  const puedePasarACotizacion = oportunidad.pipeline === "ventas" && oportunidad.estado_cierre === "abierta";
  const yaEnEtapa = (e: string) => etapas.indexOf(oportunidad.etapa) >= etapas.indexOf(e);

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ink">Muestras</p>
        {puedeSolicitar && (
          <button onClick={() => setSolicitando(true)} className="text-sm px-3 py-1.5 rounded-md bg-brand text-white">
            Solicitar muestras
          </button>
        )}
      </div>

      {mensaje && (
        <p className="text-sm bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-md p-2">{mensaje}</p>
      )}

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : muestras.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no hay solicitudes de muestras en esta oportunidad.</p>
      ) : (
        <ul className="space-y-4">
          {muestras.map((m) => {
            const info = ESTADO_MUESTRA[m.estado];
            const dias = diasRestantes(m);
            const segs = tareas.filter((t) => t.muestra_id === m.id);
            return (
              <li key={m.id} className="rounded-md border border-line p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>
                    {esVencida(m) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white">Vencida</span>
                    )}
                    <span className="text-xs text-ink-muted">
                      Solicitada el {formatoFechaCorta(m.creado_en)} · {m.vendedor?.nombre}
                    </span>
                  </span>
                  <span className="font-num text-xs text-ink-muted">{totalPares(m)} pares</span>
                </div>

                <ul className="text-ink">
                  {(m.renglones ?? []).map((r) => (
                    <li key={r.id}>
                      {r.estilo} · {r.linea}
                      {r.talla ? ` · talla ${r.talla}` : ""} ·{" "}
                      <strong className="font-num">{r.pares}</strong> pares
                      {r.pares !== r.pares_solicitados && (
                        <span className="text-xs text-ink-muted"> (solicitados {r.pares_solicitados})</span>
                      )}
                    </li>
                  ))}
                </ul>

                {m.estado === "solicitada" && (
                  <p className="text-ink-muted">⏳ Esperando la aprobación de un Administrador.</p>
                )}
                {m.estado === "rechazada" && (
                  <p className="text-red-700">
                    ❌ Rechazada{m.aprobador ? ` por ${m.aprobador.nombre}` : ""}. <strong>Motivo:</strong>{" "}
                    {m.motivo_rechazo}
                  </p>
                )}
                {m.estado !== "solicitada" && m.estado !== "rechazada" && m.aprobador && (
                  <p className="text-xs text-ink-muted">
                    Aprobada por {m.aprobador.nombre} el {formatoFechaCorta(m.fecha_aprobacion)}
                  </p>
                )}

                {m.fecha_entrega && (
                  <div className="text-ink space-y-0.5">
                    <p>
                      📦 Entregada el <strong>{formatoFechaCorta(m.fecha_entrega)}</strong> (
                      {m.forma_entrega ? FORMA_ENTREGA[m.forma_entrega] : "—"}) · recibió {m.recibio}
                    </p>
                    <p>
                      Prueba de {textoDuracion(m.prueba_valor, m.prueba_unidad)} · termina el{" "}
                      <strong>{formatoFechaCorta(m.fecha_fin_prueba)}</strong>
                      {m.estado === "en_prueba" && dias !== null && (
                        <span className={dias < 0 ? "text-red-700" : "text-ink-muted"}>
                          {" "}
                          · {dias >= 0 ? `faltan ${dias} día(s)` : `pasó hace ${-dias} día(s)`}
                        </span>
                      )}
                    </p>
                    <p className="text-ink-muted">
                      Evalúa: {m.evaluador_nombre}
                      {m.evaluador_contacto ? ` (${m.evaluador_contacto})` : ""}
                      {m.ultimo_resultado_prueba && (
                        <>
                          {" · último estado: "}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_PRUEBA[m.ultimo_resultado_prueba].color}`}>
                            {ESTADO_PRUEBA[m.ultimo_resultado_prueba].label}
                          </span>
                        </>
                      )}
                    </p>
                    {(evidencia[m.id] ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(evidencia[m.id] ?? []).map((a) =>
                          a.url && a.esImagen ? (
                            <a key={a.nombre} href={a.url} target="_blank" rel="noreferrer" title={a.nombre}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={a.url} alt={a.nombre} className="h-16 w-16 object-cover rounded-md border border-line" />
                            </a>
                          ) : a.url ? (
                            <a key={a.nombre} href={a.url} target="_blank" rel="noreferrer" className="text-xs text-brand underline self-center">
                              📎 {a.nombre}
                            </a>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                )}

                {segs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-muted mt-1">Seguimientos de la prueba</p>
                    <ul className="text-xs space-y-0.5">
                      {segs.map((t) => (
                        <li key={t.id} className="flex justify-between gap-2">
                          <span>
                            {t.estado === "completada" ? "✅" : t.estado === "cancelada" ? "⛔" : "🕑"} {t.titulo}
                            {t.detalle ? ` — ${t.detalle}` : ""}
                          </span>
                          <span className="font-num text-ink-muted whitespace-nowrap">
                            {formatoFechaCorta(t.fecha_vencimiento)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {m.estado === "evaluada" || m.estado === "cerrada" ? (
                  <div className="rounded-md bg-section p-2 space-y-0.5">
                    <p>
                      <strong>Resultado:</strong> {m.resultado ? RESULTADO_MUESTRA[m.resultado] : "—"}
                      {m.motivo_resultado ? ` · motivo: ${m.motivo_resultado}` : ""}
                    </p>
                    {m.comentarios_usuario && <p>💬 {m.comentarios_usuario}</p>}
                    <p className="text-ink-muted">{m.devolucion ? DEVOLUCION[m.devolucion] : ""}</p>
                    {m.comentario_cierre && <p className="text-ink-muted">Cierre: {m.comentario_cierre}</p>}
                  </div>
                ) : null}

                {/* Acciones según el estado */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {m.estado === "aprobada" && (
                    <button onClick={() => setEntregando(m)} className="text-sm px-3 py-1.5 rounded-md bg-brand text-white">
                      Registrar entrega
                    </button>
                  )}
                  {m.estado === "en_prueba" && (
                    <>
                      <button onClick={() => setEvaluando(m)} className="text-sm px-3 py-1.5 rounded-md bg-brand text-white">
                        Evaluación final
                      </button>
                      <button onClick={() => setModificando(m)} className="text-sm px-3 py-1.5 rounded-md border border-line">
                        Modificar prueba
                      </button>
                      {puedeVisitas && cliente && (
                        <button onClick={() => setAgendando(true)} className="text-sm px-3 py-1.5 rounded-md border border-line">
                          Agendar visita
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={() => verHistorial(m)} className="text-xs text-ink-muted underline self-center">
                    {historial[m.id] ? "Ocultar historial" : "Ver historial"}
                  </button>
                </div>

                {m.estado === "evaluada" && (
                  <div className="space-y-2 border-t border-line pt-2">
                    {m.resultado === "aprobada_cliente" && puedePasarACotizacion && !yaEnEtapa("Cotización enviada") && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          className="border border-line bg-card text-ink rounded-md px-2 py-1.5 text-sm"
                          value={etapaDestino}
                          onChange={(e) => setEtapaDestino(e.target.value)}
                        >
                          <option>Cotización enviada</option>
                          <option>Negociación</option>
                        </select>
                        <button onClick={onPasarACotizacion} className="text-sm px-3 py-1.5 rounded-md bg-green-600 text-white">
                          Pasar a cotización
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        className="flex-1 min-w-[200px] border border-line bg-card text-ink rounded-md px-3 py-1.5 text-sm"
                        placeholder="Comentario de cierre (opcional)"
                        value={comentarioCierre[m.id] ?? ""}
                        onChange={(e) => setComentarioCierre((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                      <button onClick={() => onCerrar(m)} className="text-sm px-3 py-1.5 rounded-md border border-line">
                        Cerrar muestra
                      </button>
                    </div>
                  </div>
                )}

                {historial[m.id] && (
                  <ul className="text-xs space-y-1 border-t border-line pt-2">
                    {historial[m.id].map((h) => (
                      <li key={h.id}>
                        <span className="font-num text-ink-muted">{new Date(h.creado_en).toLocaleString("es-MX")}</span>{" "}
                        — {h.autor?.nombre || "Usuario"}: {h.descripcion}
                        {h.motivo ? ` · Motivo: ${h.motivo}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {solicitando && (
        <SolicitarMuestrasModal
          oportunidadId={oportunidad.id}
          tieneValor={tieneValor}
          onClose={() => setSolicitando(false)}
          onCreada={() => {
            setSolicitando(false);
            cargar();
          }}
        />
      )}
      {entregando && (
        <EntregaMuestraModal
          muestra={entregando}
          onClose={() => setEntregando(null)}
          onHecho={() => {
            setEntregando(null);
            cargar();
          }}
        />
      )}
      {modificando && (
        <ModificarPruebaModal
          muestra={modificando}
          onClose={() => setModificando(null)}
          onHecho={() => {
            setModificando(null);
            cargar();
          }}
        />
      )}
      {evaluando && (
        <EvaluacionMuestraModal
          muestra={evaluando}
          onClose={() => setEvaluando(null)}
          onHecho={() => {
            setEvaluando(null);
            cargar();
          }}
        />
      )}
      {agendando && cliente && (
        <AgendarVisitaModal
          cliente={cliente}
          oportunidadId={oportunidad.id}
          onCancel={() => setAgendando(false)}
          onCreada={() => setAgendando(false)}
        />
      )}
    </div>
  );
}
