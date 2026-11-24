"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarMuestras } from "@/lib/data/muestras";
import { listarVendedores } from "@/lib/data/vendedores";
import {
  diasRestantes,
  ESTADO_MUESTRA,
  esVencida,
  formatoFechaCorta,
  hoyIso,
  totalPares,
} from "@/lib/muestras";
import { AprobarMuestraModal } from "@/components/AprobarMuestraModal";
import { PageHeader } from "@/components/PageHeader";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { EstadoMuestra, Muestra, Vendedor } from "@/lib/types";

type Pestana = "aprobar" | "prueba" | "evaluar" | "cerradas";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "aprobar", etiqueta: "Por aprobar" },
  { clave: "prueba", etiqueta: "Entregadas / en prueba" },
  { clave: "evaluar", etiqueta: "Por evaluar" },
  { clave: "cerradas", etiqueta: "Cerradas" },
];

function enPestana(m: Muestra, p: Pestana): boolean {
  const hoy = hoyIso();
  switch (p) {
    case "aprobar":
      return m.estado === "solicitada";
    case "prueba":
      return (
        m.estado === "aprobada" ||
        m.estado === "entregada" ||
        (m.estado === "en_prueba" && !!m.fecha_fin_prueba && m.fecha_fin_prueba > hoy)
      );
    case "evaluar":
      return m.estado === "en_prueba" && (!m.fecha_fin_prueba || m.fecha_fin_prueba <= hoy);
    case "cerradas":
      return m.estado === "evaluada" || m.estado === "cerrada" || m.estado === "rechazada";
  }
}

export default function MuestrasPage() {
  const { esAdmin } = useVendedorActual();
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("aprobar");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoMuestra | "">("");
  const [revisando, setRevisando] = useState<Muestra | null>(null);

  async function cargar() {
    try {
      setMuestras(await listarMuestras());
    } catch {
      setMuestras([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  useEffect(() => {
    if (esAdmin) listarVendedores().then(setVendedores).catch(() => {});
  }, [esAdmin]);

  const conteo = useMemo(
    () => Object.fromEntries(PESTANAS.map((p) => [p.clave, muestras.filter((m) => enPestana(m, p.clave)).length])),
    [muestras]
  );

  const visibles = muestras
    .filter((m) => enPestana(m, pestana))
    .filter((m) => !filtroVendedor || m.vendedor_id === filtroVendedor)
    .filter((m) => !filtroEstado || m.estado === filtroEstado);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-5">
      <PageHeader
        titulo="Muestras"
        descripcion={
          esAdmin
            ? "Solicitudes de muestras de todo el equipo. Solo un Administrador aprueba o rechaza."
            : "Tus solicitudes de muestras y su estado."
        }
      />

      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestana(p.clave)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-display font-medium border-b-2 -mb-px whitespace-nowrap ${
              pestana === p.clave ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {p.etiqueta}
            <span className="font-num text-[11px] px-1.5 rounded-full bg-section">{conteo[p.clave] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {esAdmin && (
          <select
            className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        )}
        <select
          className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoMuestra | "")}
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_MUESTRA) as EstadoMuestra[]).map((e) => (
            <option key={e} value={e}>
              {ESTADO_MUESTRA[e].label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-line bg-card divide-y divide-line">
        {cargando ? (
          <p className="p-4 text-sm text-ink-muted">Cargando...</p>
        ) : visibles.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">No hay muestras en esta pestaña.</p>
        ) : (
          visibles.map((m) => {
            const info = ESTADO_MUESTRA[m.estado];
            const dias = diasRestantes(m);
            return (
              <div key={m.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>
                    {esVencida(m) && <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white">Vencida</span>}
                    <span className="text-xs text-ink-muted">{m.vendedor?.nombre}</span>
                  </div>
                  <p className="font-body font-semibold text-ink">
                    <Link href={`/oportunidades/${m.oportunidad_id}`} className="hover:text-brand">
                      {m.cliente?.empresa || "Cliente"}
                    </Link>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {(m.renglones ?? []).map((r) => `${r.estilo}${r.talla ? ` (${r.talla})` : ""} ×${r.pares}`).join(" · ")}{" "}
                    — {totalPares(m)} pares
                  </p>
                  <p className="text-xs text-ink-muted">
                    Solicitada {formatoFechaCorta(m.creado_en)}
                    {m.fecha_entrega && ` · entregada ${formatoFechaCorta(m.fecha_entrega)}`}
                    {m.fecha_fin_prueba && ` · fin de prueba ${formatoFechaCorta(m.fecha_fin_prueba)}`}
                    {m.estado === "en_prueba" && dias !== null && (dias >= 0 ? ` · faltan ${dias} día(s)` : ` · pasó hace ${-dias} día(s)`)}
                  </p>
                  {m.estado === "rechazada" && <p className="text-xs text-red-700">Motivo: {m.motivo_rechazo}</p>}
                </div>
                <div className="shrink-0 flex flex-col gap-2 items-end">
                  {m.estado === "solicitada" && esAdmin && (
                    <button onClick={() => setRevisando(m)} className="text-sm px-3 py-1.5 rounded-md bg-brand text-white">
                      Revisar
                    </button>
                  )}
                  <Link href={`/oportunidades/${m.oportunidad_id}`} className="text-xs text-brand underline">
                    Abrir oportunidad
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {revisando && (
        <AprobarMuestraModal
          muestra={revisando}
          onClose={() => setRevisando(null)}
          onHecho={() => {
            setRevisando(null);
            cargar();
          }}
        />
      )}
    </main>
  );
}
