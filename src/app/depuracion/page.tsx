"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { descargarExcel } from "@/lib/excel";
import { etiquetaMotivo, MOTIVOS_NO_APTO } from "@/lib/data/llamadas";
import { listarVendedores } from "@/lib/data/vendedores";
import {
  listarDescartados,
  listarDuenoPorRevisar,
  reactivarDescartado,
  resolverDuenoPorRevisar,
  type DescartadoFila,
  type DuenoPorRevisarFila,
} from "@/lib/data/depuracion";
import type { Vendedor } from "@/lib/types";

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-MX") : "");

export default function DepuracionPage() {
  const { esAdmin, cargando: cargandoRol } = useVendedorActual();
  const [pestana, setPestana] = useState<"descartados" | "revisar">("descartados");
  const [descartados, setDescartados] = useState<DescartadoFila[] | null>(null);
  const [revisar, setRevisar] = useState<DuenoPorRevisarFila[] | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [filtroMotivo, setFiltroMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reactivar un descartado
  const [reactivando, setReactivando] = useState<DescartadoFila | null>(null);
  const [motivoReactivar, setMotivoReactivar] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Reasignar
  const [nuevoDueno, setNuevoDueno] = useState<Record<string, string>>({});

  async function cargar() {
    try {
      const [d, r, v] = await Promise.all([listarDescartados(), listarDuenoPorRevisar(), listarVendedores()]);
      setDescartados(d);
      setRevisar(r);
      setVendedores(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }

  useEffect(() => {
    if (esAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      cargar();
    }
  }, [esAdmin]);

  if (cargandoRol) return <main className="max-w-5xl mx-auto p-6 text-sm text-ink-muted">Cargando...</main>;
  if (!esAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Esta sección es solo para la administración.
        </div>
      </main>
    );
  }

  const visibles = (descartados ?? []).filter((c) =>
    !filtroMotivo ? true : filtroMotivo === "sin_clasificar" ? !c.motivo_descarte_tipo : c.motivo_descarte_tipo === filtroMotivo
  );

  async function onReactivar() {
    if (!reactivando) return;
    setGuardando(true);
    setError(null);
    try {
      await reactivarDescartado(reactivando.id, motivoReactivar.trim());
      setReactivando(null);
      setMotivoReactivar("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reactivar");
    } finally {
      setGuardando(false);
    }
  }

  async function onResolver(f: DuenoPorRevisarFila, reasignar: boolean) {
    setError(null);
    try {
      await resolverDuenoPorRevisar(f.llamadaId, reasignar ? nuevoDueno[f.llamadaId] || f.gestionadoPorId : null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function exportarDescartados() {
    await descargarExcel(
      `descartados_${new Date().toISOString().slice(0, 10)}.xlsx`,
      ["Cliente", "RFC", "Motivo", "Comentario", "Vendedor (dueño)", "Descartado por", "Fecha"],
      visibles.map((c) => [
        c.empresa,
        c.rfc,
        etiquetaMotivo(c.motivo_descarte_tipo),
        c.motivo_descarte,
        c.dueno?.nombre ?? "Sin asignar",
        c.descartado_por_vendedor?.nombre ?? "",
        fecha(c.descartado_en),
      ]),
      "Descartados"
    );
  }

  async function exportarRevisar() {
    await descargarExcel(
      `clientes_dueno_por_revisar_${new Date().toISOString().slice(0, 10)}.xlsx`,
      ["Cliente", "Dueño actual", "Lo trabaja", "Oportunidad", "Comentario", "Reportó", "Fecha"],
      (revisar ?? []).map((f) => [
        f.empresa,
        f.duenoNombre ?? "Sin asignar",
        f.gestionadoPorNombre,
        f.oportunidad ?? "",
        f.comentario,
        f.registradoPor ?? "",
        fecha(f.creadoEn),
      ]),
      "Dueño por revisar"
    );
  }

  const tab = (k: "descartados" | "revisar", etiqueta: string, n: number | undefined) => (
    <button
      onClick={() => setPestana(k)}
      className={`px-4 py-2 text-sm border-b-2 -mb-px ${
        pestana === k ? "border-brand text-ink font-medium" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {etiqueta} {n !== undefined && <span className="font-num text-xs">({n})</span>}
    </button>
  );

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <PageHeader
        titulo="Depuración de base"
        descripcion="Clientes descartados y clientes con dueño por revisar, que salen de las llamadas de cartera."
      />

      <div className="flex gap-1 border-b border-line">
        {tab("descartados", "Descartados", descartados?.length)}
        {tab("revisar", "Clientes con dueño por revisar", revisar?.length)}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {pestana === "descartados" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
              value={filtroMotivo}
              onChange={(e) => setFiltroMotivo(e.target.value)}
            >
              <option value="">Todos los motivos</option>
              {MOTIVOS_NO_APTO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="sin_clasificar">Sin clasificar (descartes anteriores)</option>
            </select>
            <button
              onClick={exportarDescartados}
              className="text-sm px-4 py-2 rounded-md border border-line bg-card text-ink"
            >
              Exportar a Excel
            </button>
          </div>
          <div className="rounded-lg border border-line bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-section text-ink-muted text-left">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Comentario</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {descartados === null ? (
                  <tr>
                    <td className="p-3 text-ink-muted" colSpan={6}>
                      Cargando...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td className="p-3 text-ink-muted" colSpan={6}>
                      No hay clientes descartados con este filtro.
                    </td>
                  </tr>
                ) : (
                  visibles.map((c) => (
                    <tr key={c.id} className="border-t align-top">
                      <td className="p-3">
                        <Link href={`/clientes/${c.id}`} className="font-medium text-ink underline">
                          {c.empresa}
                        </Link>
                        {c.rfc && <span className="block text-xs text-ink-muted">{c.rfc}</span>}
                      </td>
                      <td className="p-3">{etiquetaMotivo(c.motivo_descarte_tipo)}</td>
                      <td className="p-3 text-ink-muted max-w-xs">{c.motivo_descarte}</td>
                      <td className="p-3 whitespace-nowrap">
                        {c.descartado_por_vendedor?.nombre ?? c.dueno?.nombre ?? "—"}
                      </td>
                      <td className="p-3 font-num whitespace-nowrap">{fecha(c.descartado_en)}</td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            setReactivando(c);
                            setMotivoReactivar("");
                            setError(null);
                          }}
                          className="text-xs px-3 py-1.5 rounded-md border border-green-600 text-green-700 bg-card"
                        >
                          Reactivar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pestana === "revisar" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-muted flex-1 min-w-[16rem]">
              Un vendedor reportó que estos clientes ya los trabaja otra persona. Decide a quién se asigna.
            </p>
            <button
              onClick={exportarRevisar}
              className="text-sm px-4 py-2 rounded-md border border-line bg-card text-ink"
            >
              Exportar a Excel
            </button>
          </div>
          <div className="rounded-lg border border-line bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-section text-ink-muted text-left">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Dueño actual</th>
                  <th className="p-3">Lo trabaja</th>
                  <th className="p-3">Comentario</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {revisar === null ? (
                  <tr>
                    <td className="p-3 text-ink-muted" colSpan={6}>
                      Cargando...
                    </td>
                  </tr>
                ) : revisar.length === 0 ? (
                  <tr>
                    <td className="p-3 text-ink-muted" colSpan={6}>
                      No hay clientes por revisar. 🎉
                    </td>
                  </tr>
                ) : (
                  revisar.map((f) => (
                    <tr key={f.llamadaId} className="border-t align-top">
                      <td className="p-3">
                        <Link href={`/clientes/${f.clienteId}`} className="font-medium text-ink underline">
                          {f.empresa}
                        </Link>
                      </td>
                      <td className="p-3 whitespace-nowrap">{f.duenoNombre ?? "Sin asignar"}</td>
                      <td className="p-3">
                        {f.gestionadoPorNombre}
                        {f.oportunidad && <span className="block text-xs text-ink-muted">{f.oportunidad}</span>}
                      </td>
                      <td className="p-3 text-ink-muted max-w-xs">
                        {f.comentario}
                        {f.registradoPor && <span className="block text-xs">Reportó: {f.registradoPor}</span>}
                      </td>
                      <td className="p-3 font-num whitespace-nowrap">{fecha(f.creadoEn)}</td>
                      <td className="p-3 space-y-1.5">
                        <select
                          className="border border-line bg-card text-ink rounded-md px-2 py-1 text-xs w-full"
                          value={nuevoDueno[f.llamadaId] ?? f.gestionadoPorId}
                          onChange={(e) => setNuevoDueno((p) => ({ ...p, [f.llamadaId]: e.target.value }))}
                        >
                          {vendedores
                            .filter((v) => v.activo)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.nombre}
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => onResolver(f, true)}
                            className="text-xs px-2.5 py-1 rounded-md bg-brand text-white"
                          >
                            Reasignar
                          </button>
                          <button
                            onClick={() => onResolver(f, false)}
                            className="text-xs px-2.5 py-1 rounded-md border border-line bg-card"
                          >
                            Dejar como está
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {reactivando && (
        <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-lg p-5 w-full max-w-md mx-auto space-y-4 my-6">
            <div>
              <h3 className="font-semibold text-ink">Reactivar a {reactivando.empresa}</h3>
              <p className="text-sm text-ink-muted mt-1">
                Vuelve a Activo y podrá aparecer otra vez en listas y llamadas. El motivo queda en su historial.
              </p>
            </div>
            <label className="block text-sm">
              <span className="block text-ink-muted mb-1">Motivo de la reactivación (obligatorio)</span>
              <textarea
                autoFocus
                rows={3}
                className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
                value={motivoReactivar}
                onChange={(e) => setMotivoReactivar(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={onReactivar}
                disabled={guardando || motivoReactivar.trim().length < 3}
                className="bg-green-600 text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Reactivar"}
              </button>
              <button
                onClick={() => setReactivando(null)}
                disabled={guardando}
                className="text-sm px-4 py-2 rounded-md border border-line"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
