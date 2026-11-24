"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  actualizarOportunidad,
  cerrarOportunidad,
  listarOportunidadesPorPipeline,
} from "@/lib/data/oportunidades";
import {
  camposFaltantes,
  ETAPA_COLOR,
  ETAPA_DESCRIPCION,
  FIELD_LABELS,
  formatoMoneda,
  PIPELINES,
} from "@/lib/pipelines/config";
import { colorDeVendedor, inicialesDe } from "@/lib/vendorColors";
import { resumenPartidas, type ResumenPartidas } from "@/lib/data/partidas";
import { CerrarPerdidaModal } from "@/components/CerrarPerdidaModal";
import { CerrarGanadaModal } from "@/components/CerrarGanadaModal";
import { ReactivarModal } from "@/components/ReactivarModal";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { puedeContarEnMesAnterior } from "@/lib/mes-venta";
import type { MotivoPerdida, Oportunidad, PipelineKey } from "@/lib/types";

const PRIORIDAD_COLOR: Record<string, string> = {
  Alta: "bg-red-100 text-red-800 border-red-300",
  Media: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Baja: "bg-[var(--section)] text-ink-muted border-line",
};

export function KanbanBoard({ pipeline }: { pipeline: PipelineKey }) {
  const cfg = PIPELINES[pipeline];
  const { vendedor, esAdmin, esAdminUnidad } = useVendedorActual();
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendientePerdida, setPendientePerdida] = useState<Oportunidad | null>(null);
  const [pendienteGanada, setPendienteGanada] = useState<Oportunidad | null>(null);
  const [resumenGanada, setResumenGanada] = useState<ResumenPartidas | null>(null);
  const [pendienteReactivar, setPendienteReactivar] = useState<Oportunidad | null>(null);
  const [texto, setTexto] = useState("");
  const [vendedorFiltro, setVendedorFiltro] = useState<string>("");

  async function cargar() {
    setCargando(true);
    try {
      setOportunidades(await listarOportunidadesPorPipeline(pipeline));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    setVendedorFiltro("");
    setTexto("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline]);

  const vendedoresPresentes = useMemo(() => {
    const mapa = new Map<string, string>();
    oportunidades.forEach((o) => {
      if (o.dueno_comercial_id && o.dueno?.nombre) {
        mapa.set(o.dueno_comercial_id, o.dueno.nombre);
      }
    });
    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [oportunidades]);

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return oportunidades.filter((o) => {
      if (vendedorFiltro && o.dueno_comercial_id !== vendedorFiltro) return false;
      if (t && !(o.cliente?.empresa || "").toLowerCase().includes(t)) return false;
      return true;
    });
  }, [oportunidades, texto, vendedorFiltro]);

  const totalGeneral = filtradas.reduce(
    (sum, o) => sum + (o.valor_estimado ?? o.monto_estimado ?? 0),
    0
  );

  async function moverA(op: Oportunidad, etapaDestino: string) {
    setAviso(null);

    if (etapaDestino === cfg.etapaPerdida) {
      setPendientePerdida(op);
      return;
    }

    if (etapaDestino === cfg.etapaGanada && pipeline === "recuperacion") {
      setPendienteReactivar(op);
      return;
    }

    if (etapaDestino === cfg.etapaGanada) {
      const r = await resumenPartidas(op.id);
      if (r.n > 0 && r.sinLinea > 0) {
        setAviso(
          `No se puede cerrar "${op.cliente?.empresa || "la oportunidad"}": elige la línea de producto de cada renglón del pedido desde la ficha de la oportunidad.`
        );
        return;
      }
      setResumenGanada(r);
      setPendienteGanada(op);
      return;
    }

    const faltan = camposFaltantes(
      pipeline,
      op.etapa,
      etapaDestino,
      op as unknown as Record<string, unknown>
    );
    if (faltan.length > 0) {
      setAviso(
        `No se puede mover a "${etapaDestino}". Faltan estos datos: ${faltan
          .map((f) => FIELD_LABELS[f] || f)
          .join(", ")}. Complétalos desde la ficha de la oportunidad.`
      );
      return;
    }

    await actualizarOportunidad(op.id, { etapa: etapaDestino });
    await cargar();
  }

  async function confirmarPerdida(motivo: MotivoPerdida, detalle: string) {
    if (!pendientePerdida) return;
    await cerrarOportunidad(pendientePerdida.id, pipeline, "perdida", motivo, detalle);
    setPendientePerdida(null);
    await cargar();
  }

  async function confirmarGanada(pares: number, contextoMeta: string | null, fechaCierre: string | null, notaMes: string | null) {
    if (!pendienteGanada) return;
    await cerrarOportunidad(
      pendienteGanada.id,
      pipeline,
      "ganada",
      undefined,
      undefined,
      pares,
      contextoMeta,
      fechaCierre,
      notaMes
    );
    setPendienteGanada(null);
    await cargar();
  }

  if (cargando) {
    return <p className="p-4 text-sm text-ink-muted">Cargando tablero...</p>;
  }

  return (
    <div>
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar cliente..."
          className="px-4 py-1.5 rounded-full border border-line bg-card text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
        />
        <button
          onClick={() => setVendedorFiltro("")}
          className={`px-3 py-1.5 rounded-full text-xs font-display font-medium tracking-wide uppercase ${
            vendedorFiltro === ""
              ? "bg-ink text-card"
              : "bg-section text-ink-muted hover:bg-section-strong"
          }`}
        >
          Todos
        </button>
        {vendedoresPresentes.map((v) => (
          <button
            key={v.id}
            onClick={() => setVendedorFiltro((cur) => (cur === v.id ? "" : v.id))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
              vendedorFiltro === v.id
                ? "border-ink bg-section-strong text-ink"
                : "border-line bg-card text-ink-muted hover:bg-section"
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: colorDeVendedor(v.id) }}
            />
            {v.nombre}
          </button>
        ))}
        <div className="flex-1" />
        <p className="font-num text-xs text-ink-muted whitespace-nowrap">
          {filtradas.length} {filtradas.length === 1 ? "cuenta visible" : "cuentas visibles"} ·{" "}
          {formatoMoneda(totalGeneral)} en este pipeline
        </p>
      </div>

      {aviso && (
        <div className="mb-3 text-sm bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-md p-3">
          {aviso}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {cfg.etapas.map((etapa) => {
          const tarjetas = filtradas.filter((o) => o.etapa === etapa);
          const total = tarjetas.reduce(
            (sum, o) => sum + (o.valor_estimado ?? o.monto_estimado ?? 0),
            0
          );
          const color = ETAPA_COLOR[pipeline][etapa] || "hsl(30 8% 40%)";
          return (
            <div
              key={etapa}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const opId = e.dataTransfer.getData("text/plain");
                const op = oportunidades.find((o) => o.id === opId);
                if (op) moverA(op, etapa);
              }}
              className="flex-shrink-0 w-72 rounded-lg overflow-hidden border border-line bg-section/40 self-start"
            >
              <div className="px-3 py-2" style={{ backgroundColor: color }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display font-bold text-sm text-white truncate">{etapa}</p>
                  <span className="shrink-0 font-num text-[11px] font-semibold text-white/90 bg-black/20 rounded-full px-2 py-0.5">
                    {tarjetas.length}
                  </span>
                </div>
                {ETAPA_DESCRIPCION[pipeline][etapa] && (
                  <p className="text-[11px] leading-snug text-white/75 mt-0.5">
                    {ETAPA_DESCRIPCION[pipeline][etapa]}
                  </p>
                )}
              </div>
              <div className="px-3 py-1.5 bg-section-strong">
                <p className="font-num text-[11px] text-ink-muted">{formatoMoneda(total)}</p>
              </div>
              <div className="p-2 space-y-2 min-h-[60px]">
                {tarjetas.map((op) => (
                  <div
                    key={op.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", op.id)
                    }
                    className="bg-card rounded-lg border border-line p-3 shadow-sm cursor-move"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/oportunidades/${op.id}`}
                        className="font-body font-bold text-sm text-ink hover:text-brand leading-snug"
                      >
                        {op.cliente?.empresa || "Cliente"}
                      </Link>
                      <span
                        title={op.dueno?.nombre || "Sin asignar"}
                        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-display font-semibold text-white"
                        style={{ backgroundColor: colorDeVendedor(op.dueno_comercial_id) }}
                      >
                        {inicialesDe(op.dueno?.nombre)}
                      </span>
                    </div>
                    {op.cliente?.ciudad && (
                      <p className="text-xs text-ink-muted mt-0.5">{op.cliente.ciudad}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="font-num text-xs font-semibold text-ink">
                        {formatoMoneda(op.valor_estimado ?? op.monto_estimado)}
                      </p>
                      {op.prioridad_recuperacion && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            PRIORIDAD_COLOR[op.prioridad_recuperacion]
                          }`}
                        >
                          {op.prioridad_recuperacion}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {pendienteReactivar && (
        <ReactivarModal
          oportunidadId={pendienteReactivar.id}
          empresa={pendienteReactivar.cliente?.empresa || "este cliente"}
          onCancel={() => setPendienteReactivar(null)}
        />
      )}
      {pendientePerdida && (
        <CerrarPerdidaModal
          onCancel={() => setPendientePerdida(null)}
          onConfirm={confirmarPerdida}
        />
      )}
      {pendienteGanada && (
        <CerrarGanadaModal
          titulo={`🎉 Cerrar como "${cfg.etapaGanada}"`}
          // El contexto de meta (B2B/Tienda) es solo para el motor de
          // comisiones, que está en pausa — no se pide al cerrar ventas.
          mostrarContexto={false}
          puedeElegirMes={puedeContarEnMesAnterior(esAdmin || esAdminUnidad)}
          quien={vendedor?.nombre}
          resumenPartidas={resumenGanada}
          onCancel={() => setPendienteGanada(null)}
          onConfirm={confirmarGanada}
        />
      )}
    </div>
  );
}
