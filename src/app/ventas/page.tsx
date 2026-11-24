"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarVentasCerradas, actualizarFactura, type FiltrosVentas } from "@/lib/data/ventas";
import { listarVendedores } from "@/lib/data/vendedores";
import { formatoMoneda, PIPELINES } from "@/lib/pipelines/config";
import { VentaDetalleModal } from "@/components/VentaDetalleModal";
import { CobroVenta } from "@/components/CobroVenta";
import { PageHeader } from "@/components/PageHeader";
import { RegistrarVentaDirecta } from "@/components/RegistrarVentaDirecta";
import type { EstadoCobro, Vendedor, VentaCerrada } from "@/lib/types";

const TIPO_VENTA_COLOR: Record<string, string> = {
  Nuevo: "bg-green-100 text-green-800",
  "Expansión": "bg-blue-100 text-blue-800",
  Recompra: "bg-purple-100 text-purple-800",
  "Licitación": "bg-orange-100 text-orange-800",
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Del mes actual hacia atrás (hasta enero de 2025), para el desplegable. */
function opcionesDeMes(): { valor: string; etiqueta: string }[] {
  const out: { valor: string; etiqueta: string }[] = [];
  const hoy = new Date();
  let y = hoy.getFullYear();
  let m = hoy.getMonth();
  while (y > 2025 || (y === 2025 && m >= 0)) {
    out.push({ valor: `${y}-${String(m + 1).padStart(2, "0")}`, etiqueta: `${MESES[m]} ${y}` });
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export default function VentasPage() {
  const [ventas, setVentas] = useState<VentaCerrada[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vendedorId, setVendedorId] = useState("");
  const [unidadNegocio, setUnidadNegocio] = useState("");
  const [mes, setMes] = useState(mesActual());
  const [filtroCobro, setFiltroCobro] = useState<"" | EstadoCobro>("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [detalleVenta, setDetalleVenta] = useState<VentaCerrada | null>(null);

  useEffect(() => {
    listarVendedores().then(setVendedores).catch(() => {});
  }, []);

  function filtrosActuales(): FiltrosVentas {
    // Las fechas escritas a mano (Desde / Hasta) mandan sobre el mes elegido.
    const rango = mes ? rangoDelMes(mes) : null;
    return {
      vendedorId: vendedorId || undefined,
      unidadNegocio: unidadNegocio || undefined,
      desde: desde || rango?.desde || undefined,
      hasta: hasta || rango?.hasta || undefined,
    };
  }

  async function recargar() {
    setCargando(true);
    try {
      setVentas(await listarVentasCerradas(filtrosActuales()));
    } catch {
      setVentas([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feedback visual inmediato al cambiar filtros
    setCargando(true);
    listarVentasCerradas(filtrosActuales())
      .then(setVentas)
      .catch(() => setVentas([]))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedorId, unidadNegocio, mes, desde, hasta]);

  const unidades = useMemo(() => {
    const set = new Set(vendedores.map((v) => v.unidad_negocio).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [vendedores]);

  const totalPares = (filtroCobro ? ventas.filter((v) => v.estado_cobro === filtroCobro) : ventas).reduce((s, v) => s + (v.pares_vendidos || 0), 0);
  const visibles = filtroCobro ? ventas.filter((v) => v.estado_cobro === filtroCobro) : ventas;
  const totalFacturado = visibles.reduce((s, v) => s + (v.total_facturado || 0), 0);
  // Control de cobranza del periodo (sin importar el filtro de cobro elegido).
  const porCobrar = ventas.filter((v) => v.estado_cobro === "Pendiente");
  const cobradas = ventas.filter((v) => v.estado_cobro === "Cobrada");
  const montoPorCobrar = porCobrar.reduce((s, v) => s + (v.total_facturado || 0), 0);
  const montoCobrado = cobradas.reduce((s, v) => s + (v.total_facturado || 0), 0);

  function onCambioCobro(id: string, estado: EstadoCobro, fechaCobro: string | null) {
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, estado_cobro: estado, fecha_cobro: fechaCobro } : v)));
  }

  async function onGuardarFactura(id: string, factura: string) {
    await actualizarFactura(id, factura);
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, factura } : v)));
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <PageHeader
        titulo="Ventas"
        descripcion="Se llena sola cuando una oportunidad cierra como ganada en cualquiera de los 3 pipelines. Si el cliente ya te hizo un pedido, regístralo aquí: no pasa por el embudo."
        accion={<RegistrarVentaDirecta />}
      />

      <div className="flex flex-wrap gap-3">
        <select
          className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink"
          value={mes}
          onChange={(e) => {
            setMes(e.target.value);
            setDesde("");
            setHasta("");
          }}
        >
          <option value="">Todos los meses</option>
          {opcionesDeMes().map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <select
          className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink"
          value={vendedorId}
          onChange={(e) => setVendedorId(e.target.value)}
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
        <select
          className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink"
          value={unidadNegocio}
          onChange={(e) => setUnidadNegocio(e.target.value)}
        >
          <option value="">Todas las unidades de negocio</option>
          {unidades.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select
          className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink"
          value={filtroCobro}
          onChange={(e) => setFiltroCobro(e.target.value as "" | EstadoCobro)}
        >
          <option value="">Cobradas y pendientes</option>
          <option value="Pendiente">Solo pendientes de cobro</option>
          <option value="Cobrada">Solo cobradas</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-ink-muted">
          Desde
          <input
            type="date"
            className="border border-line bg-card rounded-md px-2 py-2 text-sm text-ink"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-ink-muted">
          Hasta
          <input
            type="date"
            className="border border-line bg-card rounded-md px-2 py-2 text-sm text-ink"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <button
          onClick={() => setFiltroCobro(filtroCobro === "Pendiente" ? "" : "Pendiente")}
          className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-left"
        >
          <p className="text-sm text-yellow-900">⏳ Por cobrar ({porCobrar.length} ventas)</p>
          <p className="font-num text-2xl font-bold text-yellow-900">{formatoMoneda(montoPorCobrar)}</p>
        </button>
        <button
          onClick={() => setFiltroCobro(filtroCobro === "Cobrada" ? "" : "Cobrada")}
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-left"
        >
          <p className="text-sm text-green-900">✅ Cobrado ({cobradas.length} ventas)</p>
          <p className="font-num text-2xl font-bold text-green-900">{formatoMoneda(montoCobrado)}</p>
        </button>
        <div className="rounded-lg border border-line bg-card p-4">
          <p className="text-sm text-ink-muted">Pares vendidos (periodo filtrado)</p>
          <p className="font-num text-2xl font-bold text-brand">{totalPares}</p>
        </div>
        <div className="rounded-lg border border-line bg-card p-4">
          <p className="text-sm text-ink-muted">Facturación (periodo filtrado)</p>
          <p className="font-num text-2xl font-bold text-brand">{formatoMoneda(totalFacturado)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-card overflow-x-auto">
        {cargando ? (
          <p className="p-4 text-sm text-ink-muted">Cargando...</p>
        ) : visibles.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Sin ventas cerradas en este periodo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-section text-ink-muted text-left">
              <tr className="font-display text-xs uppercase tracking-wide">
                <th className="p-3">Fecha</th>
                <th className="p-3">Empresa</th>
                <th className="p-3">Vendedor</th>
                <th className="p-3">Unidad</th>
                <th className="p-3">Pipeline</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Pares</th>
                <th className="p-3">Total</th>
                <th className="p-3">Precio prom.</th>
                <th className="p-3">Cobro</th>
                <th className="p-3">Factura</th>
                <th className="p-3">O. compra</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((v) => (
                <FilaVenta
                  key={v.id}
                  venta={v}
                  onGuardarFactura={onGuardarFactura}
                  onCambioCobro={onCambioCobro}
                  onVerDetalle={() => setDetalleVenta(v)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detalleVenta && (
        <VentaDetalleModal
          venta={detalleVenta}
          onClose={() => setDetalleVenta(null)}
          onCambio={recargar}
        />
      )}
    </main>
  );
}

function FilaVenta({
  venta,
  onGuardarFactura,
  onCambioCobro,
  onVerDetalle,
}: {
  venta: VentaCerrada;
  onGuardarFactura: (id: string, factura: string) => void;
  onCambioCobro: (id: string, estado: EstadoCobro, fechaCobro: string | null) => void;
  onVerDetalle: () => void;
}) {
  const [factura, setFactura] = useState(venta.factura || "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (factura === (venta.factura || "")) return;
    setGuardando(true);
    try {
      await onGuardarFactura(venta.id, factura.trim());
    } finally {
      setGuardando(false);
    }
  }

  return (
    <tr className="border-t border-line">
      <td className="p-3 whitespace-nowrap text-ink-muted font-num text-xs">
        {new Date(venta.fecha_cierre).toLocaleDateString("es-MX")}
      </td>
      <td className="p-3">
        <Link
          href={`/oportunidades/${venta.oportunidad_id}`}
          className="font-body font-semibold text-ink hover:text-brand"
        >
          {venta.empresa}
        </Link>
        <button onClick={onVerDetalle} className="block text-xs text-brand underline mt-0.5">
          Ver detalle
        </button>
      </td>
      <td className="p-3 whitespace-nowrap">{venta.vendedor_nombre || "—"}</td>
      <td className="p-3 whitespace-nowrap text-ink-muted">{venta.unidad_negocio || "—"}</td>
      <td className="p-3 whitespace-nowrap">{PIPELINES[venta.pipeline].label}</td>
      <td className="p-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_VENTA_COLOR[venta.tipo_venta]}`}>
          {venta.tipo_venta}
        </span>
      </td>
      <td className="p-3 font-num">{venta.pares_vendidos ?? "—"}</td>
      <td className="p-3 whitespace-nowrap font-num font-semibold text-ink">
        {formatoMoneda(venta.total_facturado)}
      </td>
      <td className="p-3 whitespace-nowrap text-ink-muted font-num">
        {formatoMoneda(venta.precio_promedio)}
      </td>
      <td className="p-3">
        <CobroVenta
          ventaId={venta.id}
          estado={venta.estado_cobro}
          fechaCobro={venta.fecha_cobro}
          onCambio={(e, f) => onCambioCobro(venta.id, e, f)}
        />
      </td>
      <td className="p-3">
        <input
          className="border border-line bg-card rounded-md px-2 py-1 text-xs w-28 text-ink"
          placeholder="—"
          value={factura}
          onChange={(e) => setFactura(e.target.value)}
          onBlur={guardar}
          disabled={guardando}
        />
      </td>
      <td className="p-3 whitespace-nowrap text-ink-muted text-xs">{venta.orden_compra || "—"}</td>
      <td className="p-3">
        <button onClick={onVerDetalle} className="text-xs text-brand underline whitespace-nowrap">
          Detalle
        </button>
      </td>
    </tr>
  );
}
