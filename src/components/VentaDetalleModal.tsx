"use client";

import { useEffect, useState } from "react";
import {
  actualizarCobro,
  eliminarVentaDuplicada,
  actualizarContextoMeta,
  guardarLineasDeVenta,
  listarCancelaciones,
  listarLineasDeVenta,
  registrarCancelacion,
} from "@/lib/data/ventas";
import { listarPartidas } from "@/lib/data/partidas";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { formatoMoneda } from "@/lib/pipelines/config";
import { LINEA_FLETE, LINEA_PLANTILLAS, LINEAS_DESGLOSE } from "@/lib/types";
import type {
  EstadoCobro,
  LineaPedido,
  OportunidadPartida,
  VentaCancelacion,
  VentaCerrada,
} from "@/lib/types";

// El contexto de meta (B2B/Tienda) es solo para el motor de comisiones,
// que está en pausa — se deja de mostrar aquí sin borrar el código.
const MOSTRAR_COMISIONES = false;

export function VentaDetalleModal({
  venta,
  onClose,
  onCambio,
}: {
  venta: VentaCerrada;
  onClose: () => void;
  onCambio: () => void;
}) {
  const { vendedor } = useVendedorActual();
  const [cargando, setCargando] = useState(true);
  const [lineas, setLineas] = useState<Record<LineaPedido, { pares: string; monto: string }>>({
    "Calzado de Piel": { pares: "", monto: "" },
    PVC: { pares: "", monto: "" },
    "Calzado Económico": { pares: "", monto: "" },
    Plantillas: { pares: "", monto: "" },
    Flete: { pares: "", monto: "" },
  });
  const [cancelaciones, setCancelaciones] = useState<VentaCancelacion[]>([]);
  const [partidas, setPartidas] = useState<OportunidadPartida[]>([]);
  const [estadoCobro, setEstadoCobro] = useState<EstadoCobro>(venta.estado_cobro);
  const [fechaCobro, setFechaCobro] = useState(venta.fecha_cobro || "");
  const [contextoMeta, setContextoMeta] = useState(venta.contexto_meta || "");
  const [guardandoContexto, setGuardandoContexto] = useState(false);
  const [guardandoLineas, setGuardandoLineas] = useState(false);
  const [guardandoCobro, setGuardandoCobro] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarEliminar, setMostrarEliminar] = useState(false);
  const [motivoEliminar, setMotivoEliminar] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const [ncFecha, setNcFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ncPares, setNcPares] = useState("");
  const [ncMonto, setNcMonto] = useState("");
  const [ncMotivo, setNcMotivo] = useState("");

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [ls, cs, ps] = await Promise.all([
        listarLineasDeVenta(venta.id),
        listarCancelaciones(venta.id),
        listarPartidas(venta.oportunidad_id).catch(() => [] as OportunidadPartida[]),
      ]);
      setPartidas(ps);
      const mapa = {
        "Calzado de Piel": { pares: "", monto: "" },
        PVC: { pares: "", monto: "" },
        "Calzado Económico": { pares: "", monto: "" },
        Plantillas: { pares: "", monto: "" },
        Flete: { pares: "", monto: "" },
      } as Record<LineaPedido, { pares: string; monto: string }>;
      ls.forEach((l) => {
        mapa[l.linea] = { pares: String(l.pares), monto: String(l.monto) };
      });
      setLineas(mapa);
      setCancelaciones(cs);
      setCargando(false);
    }
    cargar();
  }, [venta.id, venta.oportunidad_id]);

  // Los pares son solo de calzado; las plantillas suman al monto pero no a los pares.
  const sumaPares = LINEAS_DESGLOSE.filter((l) => l !== LINEA_PLANTILLAS && l !== LINEA_FLETE).reduce(
    (s, l) => s + (Number(lineas[l].pares) || 0),
    0
  );
  const sumaMonto = LINEAS_DESGLOSE.reduce((s, l) => s + (Number(lineas[l].monto) || 0), 0);
  const cuadraPares = sumaPares === (venta.pares_vendidos || 0);
  const cuadraMonto = Math.abs(sumaMonto - (venta.total_facturado || 0)) < 1;

  async function onGuardarLineas() {
    setGuardandoLineas(true);
    try {
      await guardarLineasDeVenta(
        venta.id,
        LINEAS_DESGLOSE.map((l) => ({
          linea: l,
          pares: Number(lineas[l].pares) || 0,
          monto: Number(lineas[l].monto) || 0,
        }))
      );
      setMensaje("Líneas guardadas.");
      onCambio();
    } finally {
      setGuardandoLineas(false);
    }
  }

  async function onEliminarVenta() {
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await eliminarVentaDuplicada(venta.id, motivoEliminar.trim());
      onCambio();
      onClose();
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : "No se pudo eliminar la venta");
      setEliminando(false);
    }
  }

  async function onGuardarCobro() {
    setGuardandoCobro(true);
    try {
      await actualizarCobro(venta.id, estadoCobro, estadoCobro === "Cobrada" ? fechaCobro || null : null);
      setMensaje("Estado de cobro actualizado.");
      onCambio();
    } finally {
      setGuardandoCobro(false);
    }
  }

  async function onGuardarContexto() {
    setGuardandoContexto(true);
    try {
      await actualizarContextoMeta(venta.id, contextoMeta.trim());
      setMensaje("Contexto de meta actualizado.");
      onCambio();
    } finally {
      setGuardandoContexto(false);
    }
  }

  async function onRegistrarCancelacion(e: React.FormEvent) {
    e.preventDefault();
    await registrarCancelacion({
      venta_id: venta.id,
      fecha: ncFecha,
      pares: Number(ncPares) || 0,
      monto: Number(ncMonto) || 0,
      motivo: ncMotivo || undefined,
      registrado_por: vendedor?.id ?? null,
    });
    setNcPares("");
    setNcMonto("");
    setNcMotivo("");
    setCancelaciones(await listarCancelaciones(venta.id));
    onCambio();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-2xl mx-auto space-y-6 my-8">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink">{venta.empresa}</h3>
            <p className="text-sm text-ink-muted">
              {venta.pares_vendidos} pares · {formatoMoneda(venta.total_facturado)}
            </p>
            {venta.orden_compra && (
              <p className="text-xs text-ink-muted">Orden de compra: {venta.orden_compra}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-ink-muted text-sm">
            ✕ Cerrar
          </button>
        </div>

        {mensaje && (
          <p className="text-sm bg-green-50 border border-green-300 text-green-800 rounded-md p-2">
            {mensaje}
          </p>
        )}

        {cargando ? (
          <p className="text-sm text-ink-muted">Cargando...</p>
        ) : (
          <>
            {/* Estado de cobro */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-ink">Estado de cobro</p>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  className="border rounded-md px-3 py-1.5 text-sm"
                  value={estadoCobro}
                  onChange={(e) => setEstadoCobro(e.target.value as EstadoCobro)}
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Cobrada">Cobrada</option>
                </select>
                {estadoCobro === "Cobrada" && (
                  <input
                    type="date"
                    className="border rounded-md px-3 py-1.5 text-sm"
                    value={fechaCobro}
                    onChange={(e) => setFechaCobro(e.target.value)}
                  />
                )}
                <button
                  onClick={onGuardarCobro}
                  disabled={guardandoCobro}
                  className="bg-brand text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {guardandoCobro ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>

            {/* Contexto de meta — oculto mientras el motor de comisiones está en pausa */}
            {MOSTRAR_COMISIONES && (
              <div className="border rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-ink">Contexto de meta</p>
                <p className="text-xs text-ink-muted">
                  Solo si el vendedor tiene más de una meta este mes (ej. Nayeli — B2B / Tienda).
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    className="border rounded-md px-3 py-1.5 text-sm"
                    placeholder="Ej. B2B"
                    value={contextoMeta}
                    onChange={(e) => setContextoMeta(e.target.value)}
                  />
                  <button
                    onClick={onGuardarContexto}
                    disabled={guardandoContexto}
                    className="bg-brand text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {guardandoContexto ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            )}

            {/* Desglose de la factura por estilo (renglones del pedido) */}
            {partidas.length > 0 && (
              <div className="border rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-ink">Desglose de la factura por estilo</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left font-display text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="pb-1 pr-2">Estilo / referencia</th>
                        <th className="pb-1 pr-2">Línea</th>
                        <th className="pb-1 pr-2 text-right">Pares</th>
                        <th className="pb-1 pr-2 text-right">Precio por par</th>
                        <th className="pb-1 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partidas.map((p) => (
                        <tr key={p.id} className="border-t border-line">
                          <td className="py-1 pr-2">{p.estilo || "—"}</td>
                          <td className="py-1 pr-2">{p.linea || "—"}</td>
                          <td className="py-1 pr-2 text-right font-num">{p.pares.toLocaleString("es-MX")}</td>
                          <td className="py-1 pr-2 text-right font-num">{formatoMoneda(p.precio_unitario)}</td>
                          <td className="py-1 text-right font-num">{formatoMoneda(p.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-line font-semibold">
                        <td className="pt-1 pr-2" colSpan={2}>Total de la factura</td>
                        <td className="pt-1 pr-2 text-right font-num">
                          {partidas.reduce((s, p) => s + Number(p.pares), 0).toLocaleString("es-MX")}
                        </td>
                        <td></td>
                        <td className="pt-1 text-right font-num text-brand">
                          {formatoMoneda(partidas.reduce((s, p) => s + Number(p.monto), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-ink-muted">
                  Las líneas de producto de abajo se calculan solas desde estos renglones. Para
                  cambiarlos, edita los renglones en la ficha de la oportunidad.
                </p>
              </div>
            )}

            {/* Líneas de producto */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-ink">Desglose por línea de producto</p>
              <table className="w-full text-sm">
                <thead className="text-ink-muted text-left">
                  <tr>
                    <th className="py-1">Línea</th>
                    <th className="py-1">Pares / piezas</th>
                    <th className="py-1">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {LINEAS_DESGLOSE.map((l) => (
                    <tr key={l}>
                      <td className="py-1 pr-2">{l}</td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          min={0}
                          className="w-24 border rounded-md px-2 py-1"
                          value={lineas[l].pares}
                          onChange={(e) =>
                            setLineas((prev) => ({
                              ...prev,
                              [l]: { ...prev[l], pares: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="py-1">
                        <input
                          type="number"
                          min={0}
                          className="w-28 border rounded-md px-2 py-1"
                          value={lineas[l].monto}
                          onChange={(e) =>
                            setLineas((prev) => ({
                              ...prev,
                              [l]: { ...prev[l], monto: e.target.value },
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`text-xs ${cuadraPares && cuadraMonto ? "text-green-700" : "text-yellow-700"}`}>
                Suma: {sumaPares} pares · {formatoMoneda(sumaMonto)}{" "}
                {cuadraPares && cuadraMonto
                  ? "✓ cuadra con el total de la venta"
                  : `⚠ debería sumar ${venta.pares_vendidos} pares y ${formatoMoneda(venta.total_facturado)}`}
              </p>
              <button
                onClick={onGuardarLineas}
                disabled={guardandoLineas}
                className="bg-brand text-white rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {guardandoLineas ? "Guardando..." : "Guardar líneas"}
              </button>
            </div>

            {/* Eliminar venta duplicada */}
            <div className="border border-red-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-ink">Venta duplicada por error</p>
                {!mostrarEliminar && (
                  <button
                    onClick={() => setMostrarEliminar(true)}
                    className="text-sm px-3 py-1.5 rounded-md border border-red-300 text-red-700 bg-card"
                  >
                    Eliminar esta venta
                  </button>
                )}
              </div>
              {mostrarEliminar && (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    rows={2}
                    value={motivoEliminar}
                    onChange={(e) => setMotivoEliminar(e.target.value)}
                    placeholder="Motivo (obligatorio). Ej. Se registró dos veces la misma factura."
                    className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
                  />
                  <p className="text-xs text-yellow-800">
                    ⚠ Se elimina la venta junto con su oportunidad (renglones, seguimientos e
                    historial). Si esta venta nació de una reactivación, el historial de recuperación
                    NO se borra (queda en su oportunidad original). Queda registrado quién la eliminó, cuándo y por qué. Si la venta ya
                    está cobrada, solo un administrador puede eliminarla.
                  </p>
                  {errorEliminar && <p className="text-sm text-red-600">{errorEliminar}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={onEliminarVenta}
                      disabled={eliminando || motivoEliminar.trim().length < 3}
                      className="bg-red-600 text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
                    >
                      {eliminando ? "Eliminando..." : "Confirmar y eliminar"}
                    </button>
                    <button
                      onClick={() => {
                        setMostrarEliminar(false);
                        setMotivoEliminar("");
                        setErrorEliminar(null);
                      }}
                      disabled={eliminando}
                      className="text-sm px-4 py-1.5 rounded-md border border-line"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cancelaciones */}
            <div className="border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-ink">
                Cancelaciones / devoluciones
              </p>
              {cancelaciones.length > 0 && (
                <ul className="text-sm space-y-1">
                  {cancelaciones.map((c) => (
                    <li key={c.id} className="flex justify-between text-ink-muted">
                      <span>
                        {new Date(c.fecha).toLocaleDateString("es-MX")} — {c.pares} pares,{" "}
                        {formatoMoneda(c.monto)} {c.motivo ? `(${c.motivo})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={onRegistrarCancelacion} className="flex flex-wrap items-end gap-2 pt-2">
                <label className="text-xs">
                  <span className="block text-ink-muted mb-1">Fecha</span>
                  <input
                    type="date"
                    className="border rounded-md px-2 py-1 text-sm"
                    value={ncFecha}
                    onChange={(e) => setNcFecha(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  <span className="block text-ink-muted mb-1">Pares</span>
                  <input
                    type="number"
                    min={0}
                    className="w-20 border rounded-md px-2 py-1 text-sm"
                    value={ncPares}
                    onChange={(e) => setNcPares(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  <span className="block text-ink-muted mb-1">Monto</span>
                  <input
                    type="number"
                    min={0}
                    className="w-24 border rounded-md px-2 py-1 text-sm"
                    value={ncMonto}
                    onChange={(e) => setNcMonto(e.target.value)}
                  />
                </label>
                <label className="text-xs flex-1">
                  <span className="block text-ink-muted mb-1">Motivo</span>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={ncMotivo}
                    onChange={(e) => setNcMotivo(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={!ncPares && !ncMonto}
                  className="text-sm px-3 py-1.5 rounded-md border border-line disabled:opacity-50"
                >
                  Registrar
                </button>
              </form>
              <p className="text-xs text-ink-muted">
                Se descuenta del mes en que se registra esta cancelación, no del mes de la venta original.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
