"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  obtenerCheckinsCompletados,
  obtenerHistorialTodo,
  obtenerMetasMes,
  obtenerOportunidadesTodas,
  obtenerVentasCerradas,
  type CheckinCompletado,
  type HistorialConContexto,
} from "@/lib/data/dashboard";
import { listarVendedores } from "@/lib/data/vendedores";
import { listarMuestras } from "@/lib/data/muestras";
import { calcularResumenMuestras } from "@/lib/muestras";
import { calcularDashboard, type ResultadoDashboard } from "@/lib/dashboard";
import { formatoMoneda } from "@/lib/pipelines/config";
import { unidadDe } from "@/lib/unidades";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { BloqueLlamadas } from "@/components/BloqueLlamadas";
import { BloqueLlamadasSemana } from "@/components/BloqueLlamadasSemana";
import { BloqueVentasDirectas } from "@/components/BloqueVentasDirectas";
import type { MetaMensual, Muestra, Oportunidad, Vendedor, VentaCerrada } from "@/lib/types";

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function DashboardPage() {
  const { esAdmin, esAdminUnidad, miUnidad, cargando: cargandoRol } = useVendedorActual();
  const [anioMes, setAnioMes] = useState(mesActual());
  const [ahora] = useState(() => Date.now());
  const [cargando, setCargando] = useState(true);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [historial, setHistorial] = useState<HistorialConContexto[]>([]);
  const [checkins, setCheckins] = useState<CheckinCompletado[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [metas, setMetas] = useState<MetaMensual[]>([]);
  const [ventasCerradas, setVentasCerradas] = useState<VentaCerrada[]>([]);
  const [muestras, setMuestras] = useState<Muestra[]>([]);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      const [ops, hist, chk, vs, ms, ventas, muestrasTodas] = await Promise.all([
        obtenerOportunidadesTodas(),
        obtenerHistorialTodo(),
        obtenerCheckinsCompletados(),
        listarVendedores(),
        obtenerMetasMes(anioMes),
        obtenerVentasCerradas(),
        listarMuestras().catch(() => [] as Muestra[]),
      ]);
      setMuestras(muestrasTodas);
      setOportunidades(ops);
      setHistorial(hist);
      setCheckins(chk);
      // Un administrador de unidad ve la base de datos de vendedores
      // completa (los nombres no son un dato privado), pero sus tablas
      // "por vendedor" solo tienen sentido con la gente de su propia
      // unidad — el resto de la BD (oportunidades, ventas, metas) ya viene
      // limitada por RLS, así que esto es solo para que el ranking no se
      // llene de filas ajenas en cero.
      setVendedores(
        vs.filter(
          (v) => v.nombre !== "Sin asignar" && (!esAdminUnidad || unidadDe(v.unidad_negocio) === miUnidad)
        )
      );
      setMetas(ms);
      setVentasCerradas(ventas);
      setCargando(false);
    }
    cargar();
  }, [anioMes, esAdminUnidad, miUnidad]);

  const resultado: ResultadoDashboard = useMemo(
    () =>
      calcularDashboard({
        anioMes,
        ahora,
        oportunidades,
        historial,
        checkins,
        vendedores,
        metas,
        ventasCerradas,
      }),
    [anioMes, ahora, oportunidades, historial, checkins, vendedores, metas, ventasCerradas]
  );

  if (cargandoRol) return <main className="max-w-6xl mx-auto p-6">Cargando...</main>;

  if (!esAdmin && !esAdminUnidad) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Esta sección es solo para administradores.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Dashboard ejecutivo{esAdminUnidad ? ` — ${miUnidad}` : ""}
          </h1>
          <p className="text-ink-muted text-sm">
            Los indicadores &quot;del mes&quot; usan el mes seleccionado; los demás son al momento actual.
            {esAdminUnidad ? ` Solo de tu unidad (${miUnidad}).` : ""}
          </p>
        </div>
        <input
          type="month"
          className="border rounded-md px-3 py-2 text-sm"
          value={anioMes}
          onChange={(e) => setAnioMes(e.target.value)}
        />
      </div>

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : (
        <>
          {/* 1) VENTAS */}
          <Seccion titulo="1. Ventas">
            <div className="rounded-lg border border-line bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-section text-ink-muted text-left">
                  <tr>
                    <th className="p-3">Etapa</th>
                    <th className="p-3">Base</th>
                    <th className="p-3">Real</th>
                    <th className="p-3">Meta</th>
                    <th className="p-3">Cumple</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.funnelResultado.map((f) => (
                    <tr key={f.label} className="border-t">
                      <td className="p-3 font-medium text-ink">{f.label}</td>
                      <td className="p-3 text-ink-muted">{f.base}</td>
                      <td className="p-3">{f.real === null ? "—" : pct(f.real)}</td>
                      <td className="p-3 text-ink-muted">{pct(f.meta)}</td>
                      <td className="p-3">
                        {f.real === null ? (
                          "—"
                        ) : f.real >= f.meta ? (
                          <span className="text-green-700">✅ Sí</span>
                        ) : (
                          <span className="text-red-700">❌ No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-line bg-card overflow-x-auto">
              <div className="p-3 flex items-center justify-between border-b bg-section">
                <p className="text-sm font-semibold text-ink">
                  Pares vendidos — {anioMes}
                </p>
                <Link href="/metas" className="text-xs text-brand underline">
                  Editar metas →
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead className="text-ink-muted text-left">
                  <tr>
                    <th className="p-3">Vendedor</th>
                    <th className="p-3">Real</th>
                    <th className="p-3">Meta</th>
                    <th className="p-3">Cumplimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.paresPorVendedor.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="p-3">{f.nombre}</td>
                      <td className="p-3">{f.real}</td>
                      <td className="p-3 text-ink-muted">{f.meta}</td>
                      <td className="p-3">
                        {f.cumplimiento === null ? (
                          "—"
                        ) : (
                          <span className={f.cumplimiento >= 1 ? "text-green-700" : "text-ink-muted"}>
                            {pct(f.cumplimiento)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {resultado.paresPorUnidad.map((f) => (
                    <tr key={f.id} className="border-t bg-indigo-50/50">
                      <td className="p-3 font-medium">{f.nombre}</td>
                      <td className="p-3">{f.real}</td>
                      <td className="p-3 text-ink-muted">{f.meta}</td>
                      <td className="p-3">
                        {f.cumplimiento === null ? (
                          "—"
                        ) : (
                          <span className={f.cumplimiento >= 1 ? "text-green-700" : "text-ink-muted"}>
                            {pct(f.cumplimiento)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-section font-semibold">
                    <td className="p-3">{esAdminUnidad ? `Total ${miUnidad}` : "Total empresa"}</td>
                    <td className="p-3">{resultado.totalParesReal}</td>
                    <td className="p-3 text-ink-muted">{resultado.totalParesMeta}</td>
                    <td className="p-3">
                      {resultado.totalParesMeta > 0
                        ? pct(resultado.totalParesReal / resultado.totalParesMeta)
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* 2) LICITACIONES */}
          <Seccion titulo="2. Licitaciones">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Tarjeta
                titulo="Participadas este mes"
                valor={String(resultado.licitacionesParticipadasMes)}
              />
              <Tarjeta
                titulo="Adjudicadas este mes"
                valor={String(resultado.licitacionesAdjudicadasMes)}
              />
              <Tarjeta
                titulo="Tasa de éxito"
                valor={
                  resultado.tasaExitoLicitaciones === null ? "—" : pct(resultado.tasaExitoLicitaciones)
                }
              />
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="text-sm text-ink-muted">
                Monto total en licitaciones activas (Identificación a Fallo)
              </p>
              <p className="text-2xl font-bold text-ink">
                {formatoMoneda(resultado.montoLicitacionesActivas)}
              </p>
            </div>
          </Seccion>

          {/* 3) RECUPERACIÓN */}
          <Seccion titulo="3. Recuperación de cartera">
            <div className="rounded-lg border border-line bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-section text-ink-muted text-left">
                  <tr>
                    <th className="p-3">Etapa</th>
                    <th className="p-3">Cuentas</th>
                    <th className="p-3">Prioridad Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.recuperacionPorEtapa.map((v) => (
                    <tr key={v.etapa} className="border-t">
                      <td className="p-3 font-medium text-ink">{v.etapa}</td>
                      <td className="p-3">{v.total}</td>
                      <td className="p-3">
                        {v.alta > 0 ? (
                          <span className="text-red-700 font-semibold">{v.alta}</span>
                        ) : (
                          0
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Tarjeta titulo="Reactivadas este mes" valor={String(resultado.reactivadasMes)} />
              <Tarjeta
                titulo="Facturación recuperada"
                valor={formatoMoneda(resultado.facturacionRecuperada)}
              />
              <Tarjeta
                titulo="Total identificado como perdido"
                valor={formatoMoneda(resultado.facturacionIdentificada)}
              />
            </div>
          </Seccion>

          {/* 4) ESTANCADAS */}
          <Seccion titulo="4. Oportunidades estancadas (+15 días sin cambio de etapa)">
            <div className="rounded-lg border border-line bg-card divide-y">
              {resultado.estancadas.length === 0 ? (
                <p className="p-4 text-sm text-ink-muted">
                  No hay oportunidades estancadas. 🎉
                </p>
              ) : (
                resultado.estancadas.map((o) => (
                  <Link
                    key={o.id}
                    href={`/oportunidades/${o.id}`}
                    className="p-3 flex items-center justify-between hover:bg-section"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {o.empresa} — {o.etapa}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {o.pipeline} · {o.vendedorNombre}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                      {o.diasEstancada} días
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Seccion>

          <BloqueVentasDirectas ventasCerradas={ventasCerradas} anioMes={anioMes} />

          {/* LLAMADAS DE CARTERA */}
          <BloqueLlamadas vendedores={vendedores} />
          <BloqueLlamadasSemana vendedores={vendedores} />

          {/* 6) MUESTRAS */}
          <BloqueMuestras muestras={muestras} anioMes={anioMes} />

          {/* 5) RANKING GENERAL */}
          <Seccion titulo="5. Ranking de actividad del equipo">
            <div className="rounded-lg border border-line bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-section text-ink-muted text-left">
                  <tr>
                    <th className="p-3">Vendedor</th>
                    <th className="p-3">Leads</th>
                    <th className="p-3">Contactos</th>
                    <th className="p-3">Cotizaciones</th>
                    <th className="p-3">Licitaciones</th>
                    <th className="p-3">Reactivación</th>
                    <th className="p-3">Check-ins</th>
                    <th className="p-3">Cierres</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.rankingFilas.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="p-3 font-medium text-ink">{f.nombre}</td>
                      <td className="p-3">{f.leads}</td>
                      <td className="p-3">{f.contactos}</td>
                      <td className="p-3">{f.cotizaciones}</td>
                      <td className="p-3">{f.licitacionesArmadas}</td>
                      <td className="p-3">{f.reactivacionContactos}</td>
                      <td className="p-3">{f.checkins}</td>
                      <td className="p-3 font-semibold text-green-700">{f.cierres}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        </>
      )}
    </main>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="text-sm text-ink-muted">{titulo}</p>
      <p className="text-2xl font-bold text-brand">{valor}</p>
    </div>
  );
}

function BloqueMuestras({ muestras, anioMes }: { muestras: Muestra[]; anioMes: string }) {
  const r = calcularResumenMuestras(muestras, anioMes);
  const conversion = r.aprobadasPorCliente > 0 ? Math.round((r.convertidas / r.aprobadasPorCliente) * 100) : null;
  return (
    <Seccion titulo="Muestras">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Tarjeta titulo="Solicitudes por aprobar" valor={String(r.porAprobar)} />
        <Tarjeta titulo="Muestras en prueba" valor={String(r.enPrueba)} />
        <Tarjeta titulo="Vencidas sin evaluar" valor={String(r.vencidas)} />
        <Tarjeta
          titulo="Conversión a venta"
          valor={conversion === null ? "—" : `${conversion}%`}
        />
      </div>
      <p className="text-xs text-ink-muted">
        Conversión: muestras aprobadas por el cliente que terminaron en venta ganada ({r.convertidas} de{" "}
        {r.aprobadasPorCliente}). Vencida = pasaron más de 7 días de la fecha fin de prueba sin evaluarla.
      </p>
      <div className="rounded-lg border border-line bg-card overflow-x-auto">
        <div className="p-3 border-b bg-section">
          <p className="text-sm font-semibold text-ink">Pares de muestra entregados — {anioMes}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-ink-muted text-left">
            <tr>
              <th className="p-3">Vendedor</th>
              <th className="p-3">Pares</th>
            </tr>
          </thead>
          <tbody>
            {r.paresEntregadosMes.length === 0 ? (
              <tr>
                <td className="p-3 text-ink-muted" colSpan={2}>
                  Sin muestras entregadas este mes.
                </td>
              </tr>
            ) : (
              r.paresEntregadosMes.map((f) => (
                <tr key={f.vendedorId} className="border-t">
                  <td className="p-3">{f.nombre}</td>
                  <td className="p-3 font-num">{f.pares}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}
