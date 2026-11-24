"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import Link from "next/link";
import {
  actualizarOportunidad,
  cerrarOportunidad,
  convertirAVentaDirecta,
  obtenerHistorial,
  obtenerOportunidad,
  obtenerVentasDeReactivacion,
} from "@/lib/data/oportunidades";
import { ReactivarModal } from "@/components/ReactivarModal";
import { LineaDeTiempo } from "@/components/LineaDeTiempo";
import { listarVendedores } from "@/lib/data/vendedores";
import {
  camposFaltantes,
  FIELD_LABELS,
  formatoMoneda,
  MOTIVOS_PERDIDA,
  PIPELINES,
} from "@/lib/pipelines/config";
import { CerrarPerdidaModal } from "@/components/CerrarPerdidaModal";
import { CerrarGanadaModal } from "@/components/CerrarGanadaModal";
import { MesDeVenta } from "@/components/MesDeVenta";
import { puedeContarEnMesAnterior } from "@/lib/mes-venta";
import { AdjuntosOportunidad } from "@/components/AdjuntosOportunidad";
import { PartidasOportunidad } from "@/components/PartidasOportunidad";
import { resumenPartidas, type ResumenPartidas } from "@/lib/data/partidas";
import { listarTareasPorOportunidad } from "@/lib/data/tareas";
import { listarComentarios, marcarComentariosLeidos } from "@/lib/data/comentarios";
import { VisitasOportunidad } from "@/components/VisitasOportunidad";
import { MuestrasOportunidad } from "@/components/MuestrasOportunidad";
import { CobroDeOportunidad } from "@/components/CobroDeOportunidad";
import {
  CajaComentario,
  ComentarioItem,
  ComentarSeguimiento,
} from "@/components/ComentariosOportunidad";
import { unidadDe } from "@/lib/unidades";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Comentario, HistorialEtapa, MotivoPerdida, Oportunidad, Tarea, Vendedor } from "@/lib/types";

function formatoHoraCorta(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

export default function OportunidadDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = usePromise(params);
  const { vendedor, esAdmin, esAdminUnidad, miUnidad } = useVendedorActual();
  const puedeReasignar = esAdmin || esAdminUnidad;
  const [op, setOp] = useState<Oportunidad | null>(null);
  const [historial, setHistorial] = useState<HistorialEtapa[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [campos, setCampos] = useState<Record<string, unknown>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarModalPerdida, setMostrarModalPerdida] = useState(false);
  const [mostrarModalGanada, setMostrarModalGanada] = useState(false);
  const [resumen, setResumen] = useState<ResumenPartidas>({ n: 0, pares: 0, paresPedido: 0, flete: 0, montoEmbarcado: 0, plantillas: 0, monto: 0, sinLinea: 0 });
  const tienePartidas = resumen.n > 0;
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const marcadoLeido = useRef<string | null>(null);
  const [mostrarReactivar, setMostrarReactivar] = useState(false);
  const [ventasLigada, setVentasLigada] = useState<{ id: string; etapa: string } | null>(null);
  const [origenRecuperacion, setOrigenRecuperacion] = useState<{ id: string; created_at: string } | null>(null);

  async function cargar() {
    setCargando(true);
    const [o, h, v, r, t, cs] = await Promise.all([
      obtenerOportunidad(id),
      obtenerHistorial(id),
      listarVendedores(),
      resumenPartidas(id),
      listarTareasPorOportunidad(id),
      listarComentarios(id).catch(() => [] as Comentario[]),
    ]);
    setComentarios(cs);
    setVentasLigada(o?.pipeline === "recuperacion" ? await obtenerVentasDeReactivacion(id).catch(() => null) : null);
    setOrigenRecuperacion(
      o?.origen_recuperacion_id
        ? await obtenerOportunidad(o.origen_recuperacion_id)
            .then((x) => (x ? { id: x.id, created_at: x.created_at } : null))
            .catch(() => null)
        : null
    );
    setResumen(r);
    setOp(o);
    setHistorial(h);
    setVendedores(v);
    setTareas(t);
    if (o) setCampos(o as unknown as Record<string, unknown>);
    setCargando(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function recargarComentarios() {
    setComentarios(await listarComentarios(id).catch(() => [] as Comentario[]));
  }

  // Al abrir la oportunidad, su dueño marca como leídos los comentarios que
  // tenía pendientes (el contador del menú se actualiza al instante).
  const duenoId = op?.dueno_comercial_id ?? null;
  const miId = vendedor?.id ?? null;
  useEffect(() => {
    if (!duenoId || !miId || duenoId !== miId || marcadoLeido.current === id) return;
    marcadoLeido.current = id;
    marcarComentariosLeidos(id)
      .then(() => window.dispatchEvent(new Event("comentarios-actualizados")))
      .catch(() => {});
  }, [id, duenoId, miId]);

  // "Nuevo": comentario que el dueño todavía no había leído cuando abrió la página.
  const esNuevo = (c: Comentario) =>
    !!duenoId && miId === duenoId && !c.leido_por_dueno && c.autor_id !== duenoId;

  if (cargando) return <main className="max-w-3xl mx-auto p-6">Cargando...</main>;
  if (!op)
    return (
      <main className="max-w-3xl mx-auto p-6">
        <p>No se encontró esta oportunidad.</p>
      </main>
    );

  const cfg = PIPELINES[op.pipeline];

  const CAMPOS_EDITABLES_COMUNES = [
    "dueno_comercial_id",
    "valor_estimado",
    "notas",
    "pares_vendidos",
    "orden_compra",
  ];
  const CAMPOS_EDITABLES_LICITACIONES = [
    "entidad_convocante",
    "fecha_limite_entrega",
    "monto_estimado",
    "monto_garantia",
    "bid_alineacion",
    "bid_capacidad",
    "bid_rentabilidad",
    "bid_probabilidad",
  ];
  const CAMPOS_EDITABLES_RECUPERACION = [
    "motivo_perdida_original",
    "fecha_ultima_compra",
    "facturacion_historica",
    "diagnostico",
  ];

  function payloadEditable(): Partial<Oportunidad> {
    let claves = [...CAMPOS_EDITABLES_COMUNES];
    if (op!.pipeline === "licitaciones") claves = [...claves, ...CAMPOS_EDITABLES_LICITACIONES];
    if (op!.pipeline === "recuperacion") claves = [...claves, ...CAMPOS_EDITABLES_RECUPERACION];
    const payload: Record<string, unknown> = {};
    claves.forEach((c) => {
      payload[c] = campos[c] ?? null;
    });
    return payload as Partial<Oportunidad>;
  }

  async function guardarCampos() {
    setGuardando(true);
    setAviso(null);
    try {
      const actualizado = await actualizarOportunidad(id, payloadEditable());
      setOp(actualizado);
      setCampos(actualizado as unknown as Record<string, unknown>);
      setAviso("Cambios guardados.");
    } finally {
      setGuardando(false);
    }
  }

  async function onVentaDirecta() {
    if (!op) return;
    if (
      !window.confirm(
        "¿Es una venta directa? Saldrá del embudo, se cancelarán sus seguimientos pendientes y solo tendrás que capturar la venta."
      )
    )
      return;
    try {
      await convertirAVentaDirecta(op.id);
      await cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo convertir");
    }
  }

  async function moverA(etapaDestino: string) {
    if (!op) return;
    setAviso(null);

    if (etapaDestino === cfg.etapaPerdida) {
      setMostrarModalPerdida(true);
      return;
    }
    if (etapaDestino === cfg.etapaGanada && op.pipeline === "recuperacion") {
      // Reactivar no registra una venta aquí: la venta nace en Ventas y no se borra nada.
      setMostrarReactivar(true);
      return;
    }
    if (etapaDestino === cfg.etapaGanada) {
      if (resumen.n > 0 && resumen.sinLinea > 0) {
        setAviso("Antes de cerrar la venta, elige la línea de producto (Piel / PVC / Económico) de cada renglón del pedido y guarda.");
        return;
      }
      setMostrarModalGanada(true);
      return;
    }

    const faltan = camposFaltantes(op.pipeline, op.etapa, etapaDestino, campos);
    if (faltan.length > 0) {
      setAviso(
        `Faltan datos para avanzar a "${etapaDestino}": ${faltan
          .map((f) => FIELD_LABELS[f] || f)
          .join(", ")}. Guárdalos abajo y vuelve a intentar.`
      );
      return;
    }

    const actualizado = await actualizarOportunidad(op.id, { etapa: etapaDestino });
    setOp(actualizado);
    setCampos(actualizado as unknown as Record<string, unknown>);
    await cargar();
  }

  async function confirmarPerdida(motivo: MotivoPerdida, detalle: string) {
    if (!op) return;
    const actualizado = await cerrarOportunidad(op.id, op.pipeline, "perdida", motivo, detalle);
    setOp(actualizado);
    setCampos(actualizado as unknown as Record<string, unknown>);
    setMostrarModalPerdida(false);
    await cargar();
  }

  async function confirmarGanada(pares: number, contextoMeta: string | null, fechaCierre: string | null, notaMes: string | null) {
    if (!op) return;
    const actualizado = await cerrarOportunidad(
      op.id,
      op.pipeline,
      "ganada",
      undefined,
      undefined,
      pares,
      contextoMeta,
      fechaCierre,
      notaMes
    );
    setOp(actualizado);
    setCampos(actualizado as unknown as Record<string, unknown>);
    setMostrarModalGanada(false);
    await cargar();
  }

  function set(campo: string, valor: unknown) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Link href="/pipelines" className="text-sm text-brand underline">
          ← Pipelines
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-2 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-ink">
              {cfg.label} — {op.etapa}
            </h1>
            <p className="text-ink-muted text-sm">
              {formatoMoneda(op.valor_estimado ?? op.monto_estimado)} · Dueño: {op.dueno?.nombre || "Sin asignar"}
            </p>
          </div>
          <EstadoBadge estado={op.estado_cierre} />
        </div>
      </div>

      {op.cliente && (
        <div className="bg-card border border-line rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-ink-muted">
            <p className="font-semibold text-ink">{op.cliente.empresa}</p>
            <p>
              {op.cliente.telefono || "sin teléfono"} · {op.cliente.email || "sin correo"} ·{" "}
              {op.cliente.direccion || op.cliente.ciudad || "sin dirección"}
            </p>
          </div>
          <Link
            href={`/clientes/${op.cliente.id}`}
            className="text-sm px-3 py-1.5 rounded-md border border-line whitespace-nowrap"
          >
            ✏️ Ver / actualizar datos del cliente
          </Link>
        </div>
      )}

      <PartidasOportunidad
        oportunidadId={op.id}
        clienteRfc={op.cliente?.rfc ?? null}
        onCambio={cargar}
      />

      {op.pipeline === "ventas" &&
        cfg.etapas.indexOf(op.etapa) >= cfg.etapas.indexOf("Cotización enviada") && (
          <AdjuntosOportunidad
            oportunidadId={op.id}
            categoria="cotizacion"
            titulo="📄 Cotización enviada al cliente"
          />
        )}

      {op.estado_cierre === "ganada" && op.fecha_cierre && puedeContarEnMesAnterior(puedeReasignar) && (
        <MesDeVenta
          oportunidadId={op.id}
          fechaCierre={op.fecha_cierre}
          esAdministracion={puedeReasignar}
          quien={vendedor?.nombre}
          onCambiado={async () => {
            await cargar();
          }}
        />
      )}

      {op.estado_cierre === "ganada" && <CobroDeOportunidad oportunidadId={op.id} />}

      {op.pipeline === "ventas" && op.estado_cierre === "ganada" && (
        <AdjuntosOportunidad
          oportunidadId={op.id}
          categoria="factura"
          titulo="🧾 Factura de venta"
        />
      )}

      {op.origen_recuperacion_id && origenRecuperacion && (
        <div className="bg-card border border-line rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-ink">Historial de recuperación</p>
            <Link href={`/oportunidades/${origenRecuperacion.id}`} className="text-sm text-brand underline">
              Ver la oportunidad original de Recuperación
            </Link>
          </div>
          <p className="text-xs text-ink-muted">
            Este cliente venía de Recuperación de cartera. Todo lo que se hizo ahí se conserva aquí.
          </p>
          <LineaDeTiempo
            oportunidades={[{ id: origenRecuperacion.id, created_at: origenRecuperacion.created_at, etiqueta: "Recuperación" }]}
          />
        </div>
      )}

      {op.pipeline === "recuperacion" && op.estado_cierre === "ganada" && ventasLigada && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 flex items-center justify-between flex-wrap gap-2">
          <span>✅ Cuenta reactivada. Su seguimiento continúa en Ventas ({ventasLigada.etapa}).</span>
          <Link href={`/oportunidades/${ventasLigada.id}`} className="underline">
            Abrir la oportunidad de Ventas
          </Link>
        </div>
      )}

      {op.origen === "venta_directa" && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          💼 <strong>Venta directa</strong>: el cliente ya hizo su pedido. No lleva seguimientos ni cuenta
          en el embudo. Captura las partidas y la factura, y presiona &quot;Cerrar Ganada&quot;.
        </div>
      )}

      {/* Stepper de etapas */}
      <div className="bg-card border border-line rounded-lg p-4">
        <p className="text-sm font-semibold text-ink mb-2">Mover a etapa</p>
        <div className="flex flex-wrap gap-2">
          {cfg.etapas.map((etapa) => (
            <button
              key={etapa}
              onClick={() => moverA(etapa)}
              disabled={etapa === op.etapa}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                etapa === op.etapa
                  ? "bg-brand text-white border-brand"
                  : "bg-card text-ink-muted border-line hover:border-gray-500"
              }`}
            >
              {etapa}
            </button>
          ))}
        </div>
        {op.estado_cierre === "abierta" && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => moverA(cfg.etapaGanada)}
              className="text-sm px-4 py-1.5 rounded-md bg-green-600 text-white"
            >
              Cerrar Ganada
            </button>
            <button
              onClick={() => setMostrarModalPerdida(true)}
              className="text-sm px-4 py-1.5 rounded-md bg-red-600 text-white"
            >
              Cerrar Perdida
            </button>
            {op.pipeline === "ventas" && op.origen !== "venta_directa" && (
              <button
                onClick={onVentaDirecta}
                className="text-sm px-4 py-1.5 rounded-md border border-blue-600 text-blue-700 bg-card"
              >
                Es una venta directa
              </button>
            )}
            {op.pipeline === "recuperacion" && (
              <button
                onClick={() => setMostrarReactivar(true)}
                className="text-sm px-4 py-1.5 rounded-md border border-green-600 text-green-700 bg-card"
              >
                Reactivar cliente
              </button>
            )}
          </div>
        )}
        {op.estado_cierre === "perdida" && op.motivo_perdida && (
          <p className="text-sm text-red-700 mt-3">
            Motivo de pérdida:{" "}
            {MOTIVOS_PERDIDA.find((m) => m.value === op.motivo_perdida)?.label}
            {op.motivo_perdida_detalle ? ` — ${op.motivo_perdida_detalle}` : ""}
          </p>
        )}
        {aviso && (
          <p className="text-sm mt-3 bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-md p-2">
            {aviso}
          </p>
        )}
      </div>

      {/* Campos editables */}
      <div className="bg-card border border-line rounded-lg p-4 space-y-4">
        <p className="text-sm font-semibold text-ink">Datos de la oportunidad</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Dueño comercial">
            {puedeReasignar ? (
              <select
                className="input"
                value={(campos.dueno_comercial_id as string) || ""}
                onChange={(e) => set("dueno_comercial_id", e.target.value || null)}
              >
                <option value="">Sin asignar</option>
                {vendedores
                  .filter((v) => !esAdminUnidad || unidadDe(v.unidad_negocio) === miUnidad)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                className="input bg-section text-ink-muted"
                value={op.dueno?.nombre || ""}
                disabled
              />
            )}
          </Campo>

          <Campo label="Número de orden de compra">
            <input
              className="input"
              placeholder="Ej. OC-7802122564"
              value={(campos.orden_compra as string) ?? ""}
              onChange={(e) => set("orden_compra", e.target.value || null)}
            />
          </Campo>

          {op.pipeline !== "licitaciones" && (
            <Campo label="Valor estimado">
              <input
                type="number"
                className="input"
                disabled={tienePartidas}
                title={tienePartidas ? "Se calcula solo con los renglones del pedido" : undefined}
                value={(campos.valor_estimado as number) ?? ""}
                onChange={(e) => set("valor_estimado", e.target.value ? Number(e.target.value) : null)}
              />
            </Campo>
          )}

          <Campo label="Pares vendidos">
            <input
              type="number"
              min={0}
              className="input"
              disabled={tienePartidas}
              title={tienePartidas ? "Se calcula solo con los renglones del pedido" : undefined}
              value={(campos.pares_vendidos as number) ?? ""}
              onChange={(e) => set("pares_vendidos", e.target.value ? Number(e.target.value) : null)}
            />
          </Campo>

          {op.pipeline === "licitaciones" && (
            <>
              <Campo label="Entidad convocante">
                <input
                  className="input"
                  value={(campos.entidad_convocante as string) || ""}
                  onChange={(e) => set("entidad_convocante", e.target.value)}
                />
              </Campo>
              <Campo label="Fecha límite de entrega">
                <input
                  type="date"
                  className="input"
                  value={(campos.fecha_limite_entrega as string) || ""}
                  onChange={(e) => set("fecha_limite_entrega", e.target.value)}
                />
              </Campo>
              <Campo label="Monto estimado">
                <input
                  type="number"
                  className="input"
                  disabled={tienePartidas}
                  value={(campos.monto_estimado as number) ?? ""}
                  onChange={(e) => set("monto_estimado", e.target.value ? Number(e.target.value) : null)}
                />
              </Campo>
              <Campo label="Monto de garantía">
                <input
                  type="number"
                  className="input"
                  value={(campos.monto_garantia as number) ?? ""}
                  onChange={(e) => set("monto_garantia", e.target.value ? Number(e.target.value) : null)}
                />
              </Campo>
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <p className="text-sm font-medium text-ink-muted mb-2">Checklist bid / no-bid</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Checkbox label="Alineación estratégica" campo="bid_alineacion" campos={campos} set={set} />
                  <Checkbox label="Capacidad de cumplir" campo="bid_capacidad" campos={campos} set={set} />
                  <Checkbox label="Rentabilidad esperada" campo="bid_rentabilidad" campos={campos} set={set} />
                  <Checkbox label="Probabilidad de ganar" campo="bid_probabilidad" campos={campos} set={set} />
                </div>
              </div>
            </>
          )}

          {op.pipeline === "recuperacion" && (
            <>
              <Campo label="Motivo de la pérdida original">
                <select
                  className="input"
                  value={(campos.motivo_perdida_original as string) || ""}
                  onChange={(e) => set("motivo_perdida_original", e.target.value)}
                >
                  <option value="">Selecciona...</option>
                  {MOTIVOS_PERDIDA.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Fecha de última compra">
                <input
                  type="date"
                  className="input"
                  value={(campos.fecha_ultima_compra as string) || ""}
                  onChange={(e) => set("fecha_ultima_compra", e.target.value)}
                />
              </Campo>
              <Campo label="Facturación histórica">
                <input
                  type="number"
                  className="input"
                  value={(campos.facturacion_historica as number) ?? ""}
                  onChange={(e) =>
                    set("facturacion_historica", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Campo>
              <Campo label="Prioridad de recuperación (automática)">
                <input
                  className="input bg-section"
                  value={(op.prioridad_recuperacion as string) || "—"}
                  disabled
                />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Diagnóstico">
                  <textarea
                    className="input"
                    rows={2}
                    value={(campos.diagnostico as string) || ""}
                    onChange={(e) => set("diagnostico", e.target.value)}
                  />
                </Campo>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <Campo label="Notas">
              <textarea
                className="input"
                rows={2}
                value={(campos.notas as string) || ""}
                onChange={(e) => set("notas", e.target.value)}
              />
            </Campo>
          </div>
        </div>

        <button
          onClick={guardarCampos}
          disabled={guardando}
          className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {/* Historial de seguimientos: qué pasó en cada llamada/visita y qué
          queda pendiente — lo que deja el vendedor al registrar cada uno
          en la pantalla de Seguimientos. */}
      {tareas.length > 0 && (
        <div className="bg-card border border-line rounded-lg p-4">
          <p className="text-sm font-semibold text-ink mb-2">Historial de seguimientos</p>
          <ul className="space-y-3">
            {tareas.map((t) => (
              <li key={t.id} className="text-sm border-b border-line last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-ink">{t.titulo}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      t.estado === "completada"
                        ? "bg-green-100 text-green-800"
                        : t.estado === "cancelada"
                          ? "bg-section text-ink-muted"
                          : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {t.estado === "completada"
                      ? "Hecho"
                      : t.estado === "cancelada"
                        ? "Cancelado"
                        : "Pendiente"}
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  {t.estado === "pendiente"
                    ? `Programado para ${new Date(
                        t.fecha_vencimiento + "T00:00:00"
                      ).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}${
                        t.hora_vencimiento ? ` a las ${formatoHoraCorta(t.hora_vencimiento)}` : ""
                      }`
                    : t.completada_at
                      ? new Date(t.completada_at).toLocaleString("es-MX")
                      : ""}
                </p>
                {t.nota && <p className="text-sm text-ink mt-1">📝 {t.nota}</p>}
                {comentarios.filter((c) => c.seguimiento_id === t.id).length > 0 && (
                  <ul className="mt-2 ml-3 space-y-2">
                    {comentarios
                      .filter((c) => c.seguimiento_id === t.id)
                      .map((c) => (
                        <ComentarioItem
                          key={c.id}
                          c={c}
                          nuevo={esNuevo(c)}
                          onCambio={recargarComentarios}
                        />
                      ))}
                  </ul>
                )}
                <div className="mt-2 ml-3">
                  <ComentarSeguimiento
                    oportunidadId={id}
                    seguimientoId={t.id}
                    onCreado={recargarComentarios}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Visitas de campo ligadas a esta oportunidad */}
      <VisitasOportunidad
        oportunidadId={id}
        cliente={op.cliente ? { id: op.cliente.id, empresa: op.cliente.empresa } : null}
      />

      {/* Solicitud de muestras y prueba */}
      <MuestrasOportunidad oportunidad={op} onOportunidadCambio={cargar} />

      {/* Comentarios de gerencia / respuestas del vendedor */}
      <div className="bg-card border border-line rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-ink">Comentarios</p>
        {comentarios.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay comentarios en esta oportunidad.</p>
        ) : (
          <ul className="space-y-2">
            {comentarios.map((c) => {
              const seg = c.seguimiento_id ? tareas.find((t) => t.id === c.seguimiento_id) : null;
              return (
                <ComentarioItem
                  key={c.id}
                  c={c}
                  nuevo={esNuevo(c)}
                  contexto={seg ? `Sobre el seguimiento: ${seg.titulo}` : null}
                  onCambio={recargarComentarios}
                />
              );
            })}
          </ul>
        )}
        <CajaComentario
          oportunidadId={id}
          seguimientoId={null}
          placeholder="Escribe un comentario o una respuesta…"
          onCreado={recargarComentarios}
        />
        <p className="text-xs text-ink-muted">
          Los comentarios quedan como historial: no se pueden editar. Solo quien lo escribió puede
          borrarlo, y solo durante los primeros 5 minutos.
        </p>
      </div>

      {/* Historial */}
      <div className="bg-card border border-line rounded-lg p-4">
        <p className="text-sm font-semibold text-ink mb-2">Historial de etapas</p>
        <ul className="space-y-2">
          {historial.map((h) => (
            <li key={h.id} className="text-sm text-ink-muted flex justify-between">
              <span>
                {h.etapa_anterior ? `${h.etapa_anterior} → ${h.etapa_nueva}` : `Creada en "${h.etapa_nueva}"`}
              </span>
              <span className="text-gray-400">
                {new Date(h.fecha).toLocaleString("es-MX")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {mostrarReactivar && (
        <ReactivarModal
          oportunidadId={op.id}
          empresa={op.cliente?.empresa || "este cliente"}
          onCancel={() => setMostrarReactivar(false)}
        />
      )}

      {mostrarModalPerdida && (
        <CerrarPerdidaModal
          onCancel={() => setMostrarModalPerdida(false)}
          onConfirm={confirmarPerdida}
        />
      )}

      {mostrarModalGanada && (
        <CerrarGanadaModal
          titulo={`🎉 Cerrar como "${cfg.etapaGanada}"`}
          // El contexto de meta (B2B/Tienda) es solo para el motor de
          // comisiones, que está en pausa — no se pide al cerrar ventas.
          mostrarContexto={false}
          puedeElegirMes={puedeContarEnMesAnterior(puedeReasignar)}
          quien={vendedor?.nombre}
          resumenPartidas={resumen}
          onCancel={() => setMostrarModalGanada(false)}
          onConfirm={confirmarGanada}
        />
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </main>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const colores: Record<string, string> = {
    abierta: "bg-blue-100 text-blue-800",
    ganada: "bg-green-100 text-green-800",
    perdida: "bg-red-100 text-red-800",
    cliente_activo: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`text-xs px-3 py-1 rounded-full ${colores[estado]}`}>
      {estado === "cliente_activo" ? "cliente activo" : estado}
    </span>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({
  label,
  campo,
  campos,
  set,
}: {
  label: string;
  campo: string;
  campos: Record<string, unknown>;
  set: (campo: string, valor: unknown) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <input
        type="checkbox"
        checked={Boolean(campos[campo])}
        onChange={(e) => set(campo, e.target.checked)}
      />
      {label}
    </label>
  );
}
