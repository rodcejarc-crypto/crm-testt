"use client";

import { useEffect, useState } from "react";
import { listarPartidas, reemplazarPartidas } from "@/lib/data/partidas";
import { leerFacturaHtml, type FacturaLeida } from "@/lib/facturaHtml";
import { formatoMoneda } from "@/lib/pipelines/config";
import { LINEA_FLETE, LINEA_PLANTILLAS, LINEAS_PEDIDO } from "@/lib/types";
import type { LineaPedido } from "@/lib/types";

interface Fila {
  estilo: string;
  linea: LineaPedido | "";
  pares: string;
  /** Vacío = se embarcó todo el renglón. */
  embarcados: string;
  precio: string;
}

const FILA_VACIA: Fila = { estilo: "", linea: "", pares: "", embarcados: "", precio: "" };

function normalizarRfc(rfc: string | null | undefined): string {
  return (rfc || "").trim().toUpperCase();
}

export function PartidasOportunidad({
  oportunidadId,
  clienteRfc,
  onCambio,
}: {
  oportunidadId: string;
  clienteRfc?: string | null;
  onCambio: () => void;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [resumenFactura, setResumenFactura] = useState<FacturaLeida | null>(null);
  const [flete, setFlete] = useState("");

  useEffect(() => {
    let activo = true;
    listarPartidas(oportunidadId)
      .then((ps) => {
        if (!activo) return;
        const productos = ps.filter((p) => p.linea !== LINEA_FLETE);
        const fletes = ps.filter((p) => p.linea === LINEA_FLETE);
        setFlete(fletes.length > 0 ? String(fletes.reduce((s, p) => s + Number(p.monto), 0)) : "");
        setFilas(
          productos.length > 0
            ? productos.map((p) => ({
                estilo: p.estilo,
                linea: p.linea ?? "",
                pares: String(p.pares),
                embarcados: p.pares_embarcados == null ? "" : String(p.pares_embarcados),
                precio: String(p.precio_unitario),
              }))
            : [{ ...FILA_VACIA }]
        );
      })
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [oportunidadId]);

  function cambiar(i: number, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambios } : f)));
    setSucio(true);
    setMensaje(null);
  }

  function agregar() {
    setFilas((prev) => [...prev, { ...FILA_VACIA }]);
    setSucio(true);
  }

  function quitar(i: number) {
    setFilas((prev) => (prev.length === 1 ? [{ ...FILA_VACIA }] : prev.filter((_, idx) => idx !== i)));
    setSucio(true);
    setMensaje(null);
  }

  const subtotal = (f: Fila) => (Number(f.pares) || 0) * (Number(f.precio) || 0);
  const totalPares = filas
    .filter((f) => f.linea !== LINEA_PLANTILLAS)
    .reduce((s, f) => s + (Number(f.pares) || 0), 0);
  const totalPlantillas = filas
    .filter((f) => f.linea === LINEA_PLANTILLAS)
    .reduce((s, f) => s + (Number(f.pares) || 0), 0);
  const fleteNum = Number(flete) || 0;
  const totalMonto = filas.reduce((s, f) => s + subtotal(f), 0) + fleteNum;
  // Lo que realmente se embarcó (es lo que cuenta en Ventas): un renglón sin
  // "embarcados" se toma completo.
  const embarcados = (f: Fila) => (f.embarcados === "" ? Number(f.pares) || 0 : Number(f.embarcados) || 0);
  const totalParesEmbarcados = filas
    .filter((f) => f.linea !== LINEA_PLANTILLAS)
    .reduce((s, f) => s + embarcados(f), 0);
  const montoEmbarcado = filas.reduce((s, f) => s + embarcados(f) * (Number(f.precio) || 0), 0) + fleteNum;
  const hayEmbarqueParcial = filas.some((f) => f.embarcados !== "" && Number(f.embarcados) !== Number(f.pares));

  async function onLeerFactura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLeyendo(true);
    setErrorLectura(null);
    setResumenFactura(null);
    try {
      const leida = await leerFacturaHtml(file);
      if (leida.renglones.length === 0) {
        setErrorLectura(
          "No se pudieron reconocer los renglones de este archivo. Verifica que sea el .html de la factura (no el PDF) y que venga del sistema de facturación de Rhinoboots. Mientras tanto, captúralos a mano abajo."
        );
        return;
      }
      setFilas(
        leida.renglones.map((r) => ({
          estilo: r.estilo,
          linea: "",
          pares: String(r.pares),
          embarcados: "",
          precio: String(r.precioUnitario),
        }))
      );
      setResumenFactura(leida);
      setSucio(true);
      setMensaje(null);
    } catch {
      setErrorLectura(
        "No se pudo leer ese archivo. Verifica que sea el .html de la factura y vuelve a intentar."
      );
    } finally {
      setLeyendo(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const utiles = filas.filter((f) => f.estilo.trim() || Number(f.pares) > 0 || Number(f.precio) > 0);
      await reemplazarPartidas(oportunidadId, [
        ...utiles.map((f) => ({
          estilo: f.estilo.trim(),
          linea: f.linea || null,
          pares: Number(f.pares) || 0,
          pares_embarcados: f.embarcados === "" ? null : Number(f.embarcados) || 0,
          precio_unitario: Number(f.precio) || 0,
        })),
        ...(fleteNum > 0
          ? [
              {
                estilo: "Cargo por flete",
                linea: LINEA_FLETE,
                pares: 1,
                pares_embarcados: null,
                precio_unitario: fleteNum,
              },
            ]
          : []),
      ]);
      setSucio(false);
      setMensaje("Renglones guardados. El valor y los pares de la oportunidad se actualizaron solos.");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const inputCls =
    "w-full border border-line bg-card text-ink rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-brand";

  const rfcNoCoincide =
    !!resumenFactura?.clienteRfc &&
    !!clienteRfc &&
    normalizarRfc(resumenFactura.clienteRfc) !== normalizarRfc(clienteRfc);

  const totalNoCuadra =
    resumenFactura?.total != null && Math.abs(totalMonto - resumenFactura.total) > 1;

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Renglones del pedido (estilos)</p>
          <p className="text-xs text-ink-muted">
            Un mismo cliente puede comprar varios estilos o referencias. Captúralos a mano, o lee la
            factura para llenarlos solos. El total se calcula solo y es el que se registra como valor
            de la oportunidad y, al cerrar, como factura de la venta.
          </p>
        </div>
        <label className="shrink-0 inline-block text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink cursor-pointer whitespace-nowrap">
          {leyendo ? "Leyendo factura..." : "📄 Leer factura (.html)"}
          <input
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={onLeerFactura}
            disabled={leyendo}
          />
        </label>
      </div>

      {errorLectura && (
        <p className="text-sm bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-md p-2">
          {errorLectura}
        </p>
      )}

      {resumenFactura && (
        <div className="text-xs bg-section rounded-md p-2 space-y-0.5">
          <p>
            Se leyeron {resumenFactura.renglones.length} renglón(es) de la factura
            {resumenFactura.folio ? ` folio ${resumenFactura.folio}` : ""}
            {resumenFactura.fecha ? ` (${resumenFactura.fecha})` : ""}.
          </p>
          {resumenFactura.clienteNombre && (
            <p>
              Cliente en la factura: <strong>{resumenFactura.clienteNombre}</strong>
              {resumenFactura.clienteRfc ? ` · RFC ${resumenFactura.clienteRfc}` : ""}
            </p>
          )}
          {resumenFactura.total != null && (
            <p>Total de la factura: {formatoMoneda(resumenFactura.total)}</p>
          )}
          <p className="text-ink-muted">
            Revisa la línea de producto (Piel/PVC/Económico) de cada renglón antes de guardar — ese
            dato no viene en la factura.
          </p>
        </div>
      )}

      {rfcNoCoincide && (
        <p className="text-sm bg-red-50 border border-red-300 text-red-800 rounded-md p-2">
          ⚠ El RFC de esta factura ({resumenFactura!.clienteRfc}) no coincide con el RFC de este
          cliente en el CRM ({clienteRfc}). Verifica que sea la factura correcta antes de guardar.
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left font-display text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="pb-1 pr-2">Estilo / referencia</th>
                  <th className="pb-1 pr-2">Línea</th>
                  <th className="pb-1 pr-2 w-24">Cantidad</th>
                  <th className="pb-1 pr-2 w-24" title="Si el pedido se embarca en partes, anota cuánto se ha embarcado. Vacío = todo.">Embarcados</th>
                  <th className="pb-1 pr-2 w-28">Precio unitario</th>
                  <th className="pb-1 pr-2 w-32 text-right">Subtotal</th>
                  <th className="pb-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="align-top">
                    <td className="pr-2 pb-2 min-w-[160px]">
                      <input
                        className={inputCls}
                        placeholder="Ej. E-450"
                        value={f.estilo}
                        onChange={(e) => cambiar(i, { estilo: e.target.value })}
                      />
                    </td>
                    <td className="pr-2 pb-2 min-w-[150px]">
                      <select
                        className={inputCls}
                        value={f.linea}
                        onChange={(e) => cambiar(i, { linea: e.target.value as LineaPedido | "" })}
                      >
                        <option value="">Selecciona…</option>
                        {LINEAS_PEDIDO.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-2 pb-2">
                      <input
                        type="number"
                        min={0}
                        className={`${inputCls} font-num text-right`}
                        value={f.pares}
                        onChange={(e) => cambiar(i, { pares: e.target.value })}
                      />
                    </td>
                    <td className="pr-2 pb-2">
                      <input
                        type="number"
                        min={0}
                        className={`${inputCls} font-num text-right`}
                        placeholder={f.pares || "todo"}
                        value={f.embarcados}
                        onChange={(e) => cambiar(i, { embarcados: e.target.value })}
                      />
                    </td>
                    <td className="pr-2 pb-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`${inputCls} font-num text-right`}
                        value={f.precio}
                        onChange={(e) => cambiar(i, { precio: e.target.value })}
                      />
                    </td>
                    <td className="pr-2 pb-2 pt-1.5 text-right font-num font-semibold text-ink">
                      {formatoMoneda(subtotal(f))}
                    </td>
                    <td className="pb-2 pt-1">
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        title="Quitar renglón"
                        className="text-ink-muted hover:text-brand text-lg leading-none"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="pt-2 font-display text-xs uppercase tracking-wide text-ink-muted" colSpan={2}>
                    Total del pedido
                  </td>
                  <td className="pt-2 pr-2 text-right font-num font-bold text-ink">
                    {totalPares.toLocaleString("es-MX")}
                    <span className="block text-[10px] font-normal text-ink-muted">pares</span>
                    {totalPlantillas > 0 && (
                      <>
                        <span className="block">{totalPlantillas.toLocaleString("es-MX")}</span>
                        <span className="block text-[10px] font-normal text-ink-muted">plantillas</span>
                      </>
                    )}
                  </td>
                  <td></td>
                  <td></td>
                  <td className="pt-2 pr-2 text-right font-num font-bold text-brand">
                    {formatoMoneda(totalMonto)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-ink-muted" htmlFor="flete">
              Cargo por flete (envío)
            </label>
            <input
              id="flete"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              className={`${inputCls} font-num text-right w-32`}
              value={flete}
              onChange={(e) => {
                setFlete(e.target.value);
                setSucio(true);
                setMensaje(null);
              }}
            />
            <span className="text-xs text-ink-muted">
              Para clientes pequeños a quienes se cobra el envío. Suma al total facturado, no a los pares.
            </span>
          </div>

          {hayEmbarqueParcial && (
            <p className="text-xs bg-section rounded-md p-2 text-ink">
              📦 Embarque parcial: en <strong>Ventas</strong> cuenta lo embarcado —{" "}
              <strong>{totalParesEmbarcados.toLocaleString("es-MX")} pares</strong> y{" "}
              <strong>{formatoMoneda(montoEmbarcado)}</strong> — no el pedido completo. Cuando se
              embarque el resto, actualiza la columna &quot;Embarcados&quot;.
            </p>
          )}

          {totalNoCuadra && (
            <p className="text-xs text-red-700">
              ⚠ El total de arriba ({formatoMoneda(totalMonto)}) no coincide con el total de la
              factura leída ({formatoMoneda(resumenFactura!.total!)}). Revisa los renglones antes de
              guardar.
            </p>
          )}
          {filas.some((f) => (f.estilo.trim() || Number(f.pares) > 0) && !f.linea) && (
            <p className="text-xs text-yellow-800">
              ⚠ Elige la línea de producto de cada renglón — es obligatoria para poder cerrar la venta.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {mensaje && <p className="text-sm text-success">{mensaje}</p>}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={agregar}
              className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink"
            >
              + Agregar otro estilo
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || !sucio}
              className="bg-brand text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar renglones"}
            </button>
            {sucio && <span className="text-xs text-ink-muted">Hay cambios sin guardar</span>}
          </div>
        </>
      )}
    </div>
  );
}
