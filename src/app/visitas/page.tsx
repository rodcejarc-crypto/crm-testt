"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { crearVisita, listarVisitas, type FiltrosVisitas } from "@/lib/data/visitas";
import { listarVendedores } from "@/lib/data/vendedores";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { VisitaDetalleModal } from "@/components/VisitaDetalleModal";
import {
  SelectorClienteOportunidad,
  type ClienteElegido,
} from "@/components/SelectorClienteOportunidad";
import { PageHeader } from "@/components/PageHeader";
import { colorDeVendedor } from "@/lib/vendorColors";
import type { EstadoVisita, Vendedor, Visita } from "@/lib/types";

const ESTADO_COLOR: Record<EstadoVisita, string> = {
  agendada: "bg-yellow-100 text-yellow-800",
  realizada: "bg-green-100 text-green-800",
};

export default function VisitasPage() {
  const router = useRouter();
  const { vendedor, esAdmin, puedeVisitas, cargando: cargandoRol } = useVendedorActual();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<Visita | null>(null);

  const [filtroEstado, setFiltroEstado] = useState<EstadoVisita | "">("");
  const [filtroVendedor, setFiltroVendedor] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [realizadaPara, setRealizadaPara] = useState("");
  const [notas, setNotas] = useState("");
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [oportunidadId, setOportunidadId] = useState<string | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Los vendedores que no hacen visitas de campo no entran aquí.
  useEffect(() => {
    if (!cargandoRol && !puedeVisitas) router.replace("/");
  }, [cargandoRol, puedeVisitas, router]);

  useEffect(() => {
    listarVendedores().then(setVendedores).catch(() => {});
  }, []);

  useEffect(() => {
    if (vendedor && !realizadaPara) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRealizadaPara(vendedor.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedor]);

  async function recargar() {
    setCargando(true);
    const filtros: FiltrosVisitas = {
      estado: filtroEstado || undefined,
      vendedorId: filtroVendedor || undefined,
    };
    try {
      setVisitas(await listarVisitas(filtros));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!puedeVisitas) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroVendedor, puedeVisitas]);

  async function onCrearVisita(e: React.FormEvent) {
    e.preventDefault();
    if (!vendedor) return;
    if (!cliente) {
      setErrorForm("Elige el cliente de la visita.");
      return;
    }
    setErrorForm(null);
    try {
      await crearVisita({
        fecha,
        vendedor_id: vendedor.id,
        realizada_para_id: realizadaPara || vendedor.id,
        cliente_id: cliente.id,
        oportunidad_id: oportunidadId,
        notas: notas || undefined,
      });
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : "No se pudo agendar la visita");
      return;
    }
    setNotas("");
    setCliente(null);
    setOportunidadId(null);
    setMostrarForm(false);
    await recargar();
  }

  if (cargandoRol || !puedeVisitas) {
    return <main className="max-w-4xl mx-auto p-6 text-sm text-ink-muted">Cargando...</main>;
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <PageHeader
        titulo="Visitas"
        descripcion="Una visita agendada no cuenta hasta que se confirma como realizada con evidencia."
        accion={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm"
          >
            + Agendar visita
          </button>
        }
      />

      {mostrarForm && (
        <form onSubmit={onCrearVisita} className="rounded-lg border border-line bg-card p-4 space-y-3">
          <SelectorClienteOportunidad
            cliente={cliente}
            oportunidadId={oportunidadId}
            onChange={(c, o) => {
              setCliente(c);
              setOportunidadId(o);
            }}
          />
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="block text-ink-muted mb-1">Fecha</span>
              <input
                type="date"
                required
                className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-ink-muted mb-1">Realizada para</span>
              <select
                className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
                value={realizadaPara}
                onChange={(e) => setRealizadaPara(e.target.value)}
              >
                {vendedor && (
                  <option value={vendedor.id}>{vendedor.nombre} (tú mismo)</option>
                )}
                {vendedores
                  .filter((v) => v.id !== vendedor?.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      Apoyo a {v.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm flex-1 min-w-[200px]">
              <span className="block text-ink-muted mb-1">Nota (opcional)</span>
              <input
                className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </label>
            <button type="submit" className="bg-brand text-white rounded-md px-4 py-2 text-sm">
              Agendar
            </button>
          </div>
          {errorForm && <p className="text-sm text-red-600">{errorForm}</p>}
        </form>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoVisita | "")}
        >
          <option value="">Todos los estados</option>
          <option value="agendada">Agendada</option>
          <option value="realizada">Realizada</option>
        </select>
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
      </div>

      <div className="rounded-lg border border-line bg-card divide-y">
        {cargando ? (
          <p className="p-4 text-sm text-ink-muted">Cargando...</p>
        ) : visitas.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Sin visitas registradas.</p>
        ) : (
          visitas.map((v) => (
            <div key={v.id} className="w-full p-4 flex items-center justify-between gap-2 hover:bg-section">
              <button onClick={() => setDetalle(v)} className="text-left flex-1 min-w-0">
                <p className="text-sm font-body font-semibold text-ink flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: colorDeVendedor(v.vendedor_id) }}
                  />
                  <span className="font-num text-ink-muted font-normal">
                    {new Date(v.fecha + "T00:00:00").toLocaleDateString("es-MX")}
                  </span>{" "}
                  — {v.vendedor?.nombre}
                  {v.realizada_para_id !== v.vendedor_id && ` → ${v.realizada_para?.nombre}`}
                </p>
                <p className="text-sm text-ink">
                  {v.cliente ? (
                    <>
                      {v.cliente.empresa}
                      {v.oportunidad_id && (
                        <>
                          {" · "}
                          <Link
                            href={`/oportunidades/${v.oportunidad_id}`}
                            className="text-brand underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ver oportunidad
                          </Link>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-muted">Sin cliente ligado</span>
                  )}
                </p>
                {v.notas && <p className="text-sm text-ink-muted truncate">{v.notas}</p>}
                {v.estado === "agendada" && (
                  <p className="text-xs text-brand mt-0.5">📎 Toca aquí para subir la evidencia</p>
                )}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {v.estado === "agendada" && (
                  <button
                    onClick={() => setDetalle(v)}
                    className="text-xs px-3 py-1.5 rounded-md border border-brand text-brand bg-red-50 whitespace-nowrap"
                  >
                    Subir evidencia
                  </button>
                )}
                <span className={`text-xs px-2 py-1 rounded-full ${ESTADO_COLOR[v.estado]}`}>
                  {v.estado}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {detalle && (
        <VisitaDetalleModal
          visita={detalle}
          onClose={() => setDetalle(null)}
          onCambio={recargar}
        />
      )}
    </main>
  );
}
