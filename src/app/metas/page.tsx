"use client";

import { useEffect, useMemo, useState } from "react";
import {
  actualizarMeta,
  agregarReglaAcelerador,
  borrarMeta,
  borrarReglaAcelerador,
  copiarMetasDelMesAnterior,
  guardarMetas,
  guardarTarifa,
  listarMetas,
  listarReglasAcelerador,
  listarTarifas,
} from "@/lib/data/metas";
import { listarVendedores } from "@/lib/data/vendedores";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { LINEAS_PRODUCTO } from "@/lib/types";
import type { MetaMensual, ReglaAcelerador, Vendedor } from "@/lib/types";

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// El motor de comisiones está en pausa (ver src/app/comisiones/page.tsx).
// Mientras tanto, esta pantalla solo captura meta total + piso de Piel por
// vendedor/unidad (lo que usa el dashboard ejecutivo). Las columnas de
// visitas y las secciones de tarifas/acelerador quedan ocultas pero sin
// borrar — se reactivan cambiando esta constante a true.
const MOSTRAR_COMISIONES = false;

function mesAnterior(anioMes: string): string {
  const [y, m] = anioMes.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MetasPage() {
  const { esAdmin, cargando: cargandoRol } = useVendedorActual();
  const [anioMes, setAnioMes] = useState(mesActual());
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [metas, setMetas] = useState<MetaMensual[]>([]);
  const [reglas, setReglas] = useState<ReglaAcelerador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);

  // formulario "agregar meta"
  const [nuevoTipo, setNuevoTipo] = useState<"vendedor" | "unidad">("vendedor");
  const [nuevoVendedorId, setNuevoVendedorId] = useState("");
  const [nuevaUnidad, setNuevaUnidad] = useState("");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [nuevaMetaTotal, setNuevaMetaTotal] = useState("");
  const [nuevoPisoPiel, setNuevoPisoPiel] = useState("");
  const [nuevasVisitasReq, setNuevasVisitasReq] = useState("");
  const [nuevoVisitasParaId, setNuevoVisitasParaId] = useState("");

  // formulario "agregar regla"
  const [nuevoUmbral, setNuevoUmbral] = useState("");
  const [nuevoMultiplicador, setNuevoMultiplicador] = useState("");
  const [nuevoBonoPorPar, setNuevoBonoPorPar] = useState("");

  async function cargar() {
    setCargando(true);
    setMensaje(null);
    const [vs, ms, ts, rs] = await Promise.all([
      listarVendedores(),
      listarMetas(anioMes),
      listarTarifas(anioMes),
      listarReglasAcelerador(anioMes),
    ]);
    setVendedores(vs.filter((v) => v.nombre !== "Sin asignar"));
    setMetas(ms);
    const mapaTarifas: Record<string, { con: number; sin: number }> = {};
    LINEAS_PRODUCTO.forEach((l) => (mapaTarifas[l] = { con: 0, sin: 0 }));
    ts.forEach((t) => {
      mapaTarifas[t.linea] = {
        con: Number(t.tarifa_por_par),
        sin: Number(t.tarifa_sin_llave),
      };
    });
    setTarifasForm(mapaTarifas);
    setReglas(rs);
    setCargando(false);
  }

  const [tarifasForm, setTarifasForm] = useState<Record<string, { con: number; sin: number }>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anioMes]);

  const nombreVendedor = useMemo(() => {
    const m = new Map(vendedores.map((v) => [v.id, v]));
    return (id: string | null) => (id ? m.get(id)?.nombre || "?" : "?");
  }, [vendedores]);

  const totalMeta = metas.reduce((s, m) => s + Number(m.meta_total_pares), 0);
  const totalPiso = metas.reduce((s, m) => s + Number(m.piso_piel_pares), 0);

  async function onCopiar() {
    setCopiando(true);
    setMensaje(null);
    try {
      const n = await copiarMetasDelMesAnterior(mesAnterior(anioMes), anioMes);
      setMensaje(n > 0 ? `Se copiaron ${n} meta(s).` : "El mes anterior no tiene metas capturadas.");
      await cargar();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error al copiar");
    } finally {
      setCopiando(false);
    }
  }

  async function onAgregarMeta(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    try {
      await guardarMetas([
        {
          tipo: nuevoTipo,
          vendedor_id: nuevoTipo === "vendedor" ? nuevoVendedorId : null,
          unidad_negocio: nuevoTipo === "unidad" ? nuevaUnidad.trim() : null,
          etiqueta: nuevaEtiqueta.trim() || null,
          anio_mes: anioMes,
          meta_total_pares: Number(nuevaMetaTotal) || 0,
          piso_piel_pares: Number(nuevoPisoPiel) || 0,
          visitas_requeridas: nuevasVisitasReq ? Number(nuevasVisitasReq) : null,
          visitas_para_id: nuevoVisitasParaId || null,
        },
      ]);
      setNuevoVendedorId("");
      setNuevaUnidad("");
      setNuevaEtiqueta("");
      setNuevaMetaTotal("");
      setNuevoPisoPiel("");
      setNuevasVisitasReq("");
      setNuevoVisitasParaId("");
      await cargar();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "Error al guardar");
    }
  }

  async function onEditarMeta(id: string, campo: "meta_total_pares" | "piso_piel_pares", valor: string) {
    setMetas((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [campo]: Number(valor) || 0 } : m))
    );
  }

  async function onEditarVisitasReq(id: string, valor: string) {
    setMetas((prev) =>
      prev.map((m) => (m.id === id ? { ...m, visitas_requeridas: valor ? Number(valor) : null } : m))
    );
  }

  async function onEditarVisitasPara(id: string, valor: string) {
    setMetas((prev) =>
      prev.map((m) => (m.id === id ? { ...m, visitas_para_id: valor || null } : m))
    );
  }

  async function onGuardarFilaMeta(m: MetaMensual) {
    await actualizarMeta(m.id, {
      meta_total_pares: m.meta_total_pares,
      piso_piel_pares: m.piso_piel_pares,
      visitas_requeridas: m.visitas_requeridas,
      visitas_para_id: m.visitas_para_id,
    });
  }

  async function onBorrarMeta(id: string) {
    await borrarMeta(id);
    await cargar();
  }

  async function onGuardarTarifas() {
    for (const l of LINEAS_PRODUCTO) {
      const t = tarifasForm[l] || { con: 0, sin: 0 };
      await guardarTarifa(anioMes, l, t.con, l === "Calzado de Piel" ? t.con : t.sin);
    }
    setMensaje("Tarifas guardadas.");
    await cargar();
  }

  async function onAgregarRegla(e: React.FormEvent) {
    e.preventDefault();
    await agregarReglaAcelerador(
      anioMes,
      Number(nuevoUmbral) || 0,
      Number(nuevoMultiplicador) || 1,
      reglas.length,
      Number(nuevoBonoPorPar) || 0
    );
    setNuevoUmbral("");
    setNuevoMultiplicador("");
    setNuevoBonoPorPar("");
    await cargar();
  }

  if (cargandoRol) return <main className="max-w-4xl mx-auto p-6">Cargando...</main>;

  if (!esAdmin) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Esta sección es solo para Dirección Comercial.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">Metas</h1>
          <p className="text-ink-muted text-sm">
            Meta total y piso de Calzado de Piel, por vendedor o por unidad de negocio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="border rounded-md px-3 py-2 text-sm"
            value={anioMes}
            onChange={(e) => setAnioMes(e.target.value)}
          />
          <button
            onClick={onCopiar}
            disabled={copiando}
            className="text-sm px-3 py-2 rounded-md border border-line disabled:opacity-50 whitespace-nowrap"
          >
            {copiando ? "Copiando..." : "Copiar metas del mes anterior"}
          </button>
        </div>
      </div>

      {mensaje && (
        <p className="text-sm bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-md p-3">
          {mensaje}
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : (
        <>
          <div className="rounded-lg border border-line bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-section text-ink-muted text-left">
                <tr>
                  <th className="p-3">Ejecutivo / Unidad</th>
                  <th className="p-3">Etiqueta</th>
                  <th className="p-3">Meta total (pares)</th>
                  <th className="p-3">Piso Calzado de Piel</th>
                  {MOSTRAR_COMISIONES && (
                    <>
                      <th className="p-3">Visitas requeridas</th>
                      <th className="p-3">Visitas para</th>
                    </>
                  )}
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-3">
                      {m.tipo === "unidad" ? `🏢 ${m.unidad_negocio}` : nombreVendedor(m.vendedor_id)}
                    </td>
                    <td className="p-3 text-ink-muted">{m.etiqueta || "—"}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        className="w-24 border rounded-md px-2 py-1 text-right"
                        value={m.meta_total_pares}
                        onChange={(e) => onEditarMeta(m.id, "meta_total_pares", e.target.value)}
                        onBlur={() => onGuardarFilaMeta(m)}
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        className="w-24 border rounded-md px-2 py-1 text-right"
                        value={m.piso_piel_pares}
                        onChange={(e) => onEditarMeta(m.id, "piso_piel_pares", e.target.value)}
                        onBlur={() => onGuardarFilaMeta(m)}
                      />
                    </td>
                    {MOSTRAR_COMISIONES && (
                      <>
                        <td className="p-3">
                          <input
                            type="number"
                            min={0}
                            placeholder="—"
                            className="w-20 border rounded-md px-2 py-1 text-right"
                            value={m.visitas_requeridas ?? ""}
                            onChange={(e) => onEditarVisitasReq(m.id, e.target.value)}
                            onBlur={() => onGuardarFilaMeta(m)}
                          />
                        </td>
                        <td className="p-3">
                          <select
                            className="border rounded-md px-2 py-1 text-sm"
                            value={m.visitas_para_id ?? ""}
                            onChange={(e) => {
                              onEditarVisitasPara(m.id, e.target.value);
                              onGuardarFilaMeta({ ...m, visitas_para_id: e.target.value || null });
                            }}
                          >
                            <option value="">Propias</option>
                            {vendedores.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                      </>
                    )}
                    <td className="p-3">
                      <button
                        onClick={() => onBorrarMeta(m.id)}
                        className="text-xs text-red-600 underline"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-section font-semibold">
                  <td className="p-3" colSpan={2}>
                    Total compañía
                  </td>
                  <td className="p-3">{totalMeta.toLocaleString("es-MX")}</td>
                  <td className="p-3">{totalPiso.toLocaleString("es-MX")}</td>
                  <td colSpan={MOSTRAR_COMISIONES ? 3 : 1} />
                </tr>
              </tbody>
            </table>
          </div>

          <form
            onSubmit={onAgregarMeta}
            className="rounded-lg border border-line bg-card p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold text-ink">Agregar meta</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-sm">
                <span className="block text-ink-muted mb-1">Tipo</span>
                <select
                  className="border rounded-md px-2 py-2 text-sm"
                  value={nuevoTipo}
                  onChange={(e) => setNuevoTipo(e.target.value as "vendedor" | "unidad")}
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="unidad">Unidad de negocio</option>
                </select>
              </label>

              {nuevoTipo === "vendedor" ? (
                <label className="text-sm">
                  <span className="block text-ink-muted mb-1">Vendedor</span>
                  <select
                    className="border rounded-md px-2 py-2 text-sm"
                    value={nuevoVendedorId}
                    onChange={(e) => setNuevoVendedorId(e.target.value)}
                  >
                    <option value="">Selecciona...</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="text-sm">
                  <span className="block text-ink-muted mb-1">Unidad de negocio</span>
                  <input
                    className="border rounded-md px-2 py-2 text-sm"
                    placeholder="Ej. Guadalajara"
                    value={nuevaUnidad}
                    onChange={(e) => setNuevaUnidad(e.target.value)}
                  />
                </label>
              )}

              <label className="text-sm">
                <span className="block text-ink-muted mb-1">Etiqueta (opcional)</span>
                <input
                  className="border rounded-md px-2 py-2 text-sm w-28"
                  placeholder="Ej. B2B"
                  value={nuevaEtiqueta}
                  onChange={(e) => setNuevaEtiqueta(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-ink-muted mb-1">Meta total</span>
                <input
                  type="number"
                  min={0}
                  className="border rounded-md px-2 py-2 text-sm w-24"
                  value={nuevaMetaTotal}
                  onChange={(e) => setNuevaMetaTotal(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-ink-muted mb-1">Piso Piel</span>
                <input
                  type="number"
                  min={0}
                  className="border rounded-md px-2 py-2 text-sm w-24"
                  value={nuevoPisoPiel}
                  onChange={(e) => setNuevoPisoPiel(e.target.value)}
                />
              </label>

              {MOSTRAR_COMISIONES && (
                <>
                  <label className="text-sm">
                    <span className="block text-ink-muted mb-1">Visitas req. (opcional)</span>
                    <input
                      type="number"
                      min={0}
                      className="border rounded-md px-2 py-2 text-sm w-24"
                      value={nuevasVisitasReq}
                      onChange={(e) => setNuevasVisitasReq(e.target.value)}
                    />
                  </label>

                  <label className="text-sm">
                    <span className="block text-ink-muted mb-1">Visitas para (opcional)</span>
                    <select
                      className="border rounded-md px-2 py-2 text-sm"
                      value={nuevoVisitasParaId}
                      onChange={(e) => setNuevoVisitasParaId(e.target.value)}
                    >
                      <option value="">Propias</option>
                      {vendedores.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <button
                type="submit"
                disabled={nuevoTipo === "vendedor" ? !nuevoVendedorId : !nuevaUnidad.trim()}
                className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          </form>

          {MOSTRAR_COMISIONES && (
            <>
              <section className="space-y-3">
                <h2 className="text-lg font-bold text-ink">Tarifas por línea — {anioMes}</h2>
                <p className="text-xs text-ink-muted">
                  Calzado de Piel siempre paga la misma tarifa. PVC y Calzado Económico pagan la
                  tarifa alta solo si el vendedor llegó a &quot;la llave&quot; (85% de su piso de Piel); si
                  no, pagan la tarifa baja.
                </p>
                <div className="rounded-lg border border-line bg-card p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs text-ink-muted font-semibold px-1">
                    <span>Línea</span>
                    <span>Con llave ($/par)</span>
                    <span>Sin llave ($/par)</span>
                  </div>
                  {LINEAS_PRODUCTO.map((l) => (
                    <div key={l} className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-sm text-ink-muted">{l}</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="border rounded-md px-2 py-1 text-sm text-right"
                        value={tarifasForm[l]?.con ?? 0}
                        onChange={(e) =>
                          setTarifasForm((f) => ({
                            ...f,
                            [l]: { ...f[l], con: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={l === "Calzado de Piel"}
                        className="border rounded-md px-2 py-1 text-sm text-right disabled:bg-section"
                        value={
                          l === "Calzado de Piel" ? tarifasForm[l]?.con ?? 0 : tarifasForm[l]?.sin ?? 0
                        }
                        onChange={(e) =>
                          setTarifasForm((f) => ({
                            ...f,
                            [l]: { ...f[l], sin: Number(e.target.value) || 0 },
                          }))
                        }
                      />
                    </div>
                  ))}
                  <button
                    onClick={onGuardarTarifas}
                    className="bg-brand text-white rounded-md px-4 py-2 text-sm"
                  >
                    Guardar tarifas
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-bold text-ink">
                  Acelerador (solo Calzado de Piel) — {anioMes}
                </h2>
                <p className="text-xs text-ink-muted">
                  Solo aplica si el vendedor llegó a la llave Y cumplió su condición de visitas (si
                  tiene una). El bono se paga por par, sobre el excedente dentro de cada tramo.
                </p>
                <div className="rounded-lg border border-line bg-card divide-y">
                  {reglas.length === 0 ? (
                    <p className="p-3 text-sm text-ink-muted">Sin reglas capturadas para este mes.</p>
                  ) : (
                    reglas.map((r) => (
                      <div key={r.id} className="p-3 flex items-center justify-between">
                        <span className="text-sm">
                          Al alcanzar <strong>{r.umbral_pct}%</strong> del piso de Piel → +
                          <strong>${r.bono_por_par}/par</strong> de bono sobre el excedente
                        </span>
                        <button
                          onClick={() => borrarReglaAcelerador(r.id).then(cargar)}
                          className="text-xs text-red-600 underline"
                        >
                          Borrar
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={onAgregarRegla} className="flex items-end gap-2">
                  <label className="text-sm">
                    <span className="block text-ink-muted mb-1">Umbral (% del piso)</span>
                    <input
                      type="number"
                      min={0}
                      className="border rounded-md px-2 py-2 text-sm w-28"
                      value={nuevoUmbral}
                      onChange={(e) => setNuevoUmbral(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-ink-muted mb-1">Bono $/par</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      className="border rounded-md px-2 py-2 text-sm w-24"
                      value={nuevoBonoPorPar}
                      onChange={(e) => setNuevoBonoPorPar(e.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!nuevoUmbral || !nuevoBonoPorPar}
                    className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
                  >
                    Agregar regla
                  </button>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
