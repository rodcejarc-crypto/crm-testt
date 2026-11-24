"use client";

import { useEffect, useState } from "react";
import {
  avisosCarteraAgotada,
  resumenLlamadas,
  resumenSemanaLlamadas,
  type AvisoCarteraAgotada,
  type FilaLlamadasVendedor,
  type SemanaLlamadasVendedor,
} from "@/lib/data/llamadas";
import { formatoFecha, listarPausas, pausasActivasPorVendedor, type PausaLlamadas } from "@/lib/data/pausas";
import type { Vendedor } from "@/lib/types";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function lunesDeSemana(desplazamiento: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia + desplazamiento * 7);
  return d;
}

const aFecha = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Avance del programa de llamadas de cartera: una fila por vendedor que participa, y el detalle por día de la semana. */
export function BloqueLlamadas({ vendedores }: { vendedores: Vendedor[] }) {
  const [filas, setFilas] = useState<FilaLlamadasVendedor[] | null>(null);
  const [agotadas, setAgotadas] = useState<AvisoCarteraAgotada[]>([]);
  const [pausas, setPausas] = useState<PausaLlamadas[]>([]);
  const [semana, setSemana] = useState(0);
  const [porDia, setPorDia] = useState<SemanaLlamadasVendedor[] | null>(null);

  useEffect(() => {
    resumenLlamadas()
      .then(setFilas)
      .catch(() => setFilas([]));
    listarPausas()
      .then(setPausas)
      .catch(() => setPausas([]));
    avisosCarteraAgotada(aFecha(new Date()))
      .then(setAgotadas)
      .catch(() => setAgotadas([]));
  }, []);

  useEffect(() => {
    let vigente = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPorDia(null);
    resumenSemanaLlamadas(lunesDeSemana(semana))
      .then((r) => vigente && setPorDia(r))
      .catch(() => vigente && setPorDia([]));
    return () => {
      vigente = false;
    };
  }, [semana]);

  const participantes = vendedores.filter((v) => (v.meta_llamadas_diarias ?? 0) > 0);
  if (participantes.length === 0) return null;

  const porId = new Map((filas ?? []).map((f) => [f.vendedorId, f]));
  const pausaActiva = pausasActivasPorVendedor(pausas);
  const semanaPorId = new Map((porDia ?? []).map((s) => [s.vendedorId, s]));

  const lunes = lunesDeSemana(semana);
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  const fechasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return d;
  });
  // Sábado y domingo solo se muestran si hubo actividad.
  const hayFinDeSemana = (i: number) =>
    (porDia ?? []).some((s) => s.dias[i].asignadas > 0 || s.dias[i].registradas > 0);
  const indicesVisibles = [0, 1, 2, 3, 4, 5, 6].filter((i) => i < 5 || hayFinDeSemana(i));

  const filasSemana = participantes.map((v) => ({ v, s: semanaPorId.get(v.id) }));
  const totalAsignadas = filasSemana.reduce((n, f) => n + (f.s?.asignadas ?? 0), 0);
  const totalRegistradas = filasSemana.reduce((n, f) => n + (f.s?.registradas ?? 0), 0);
  const cumplimientoTotal = totalAsignadas > 0 ? Math.min(100, Math.round((totalRegistradas / totalAsignadas) * 100)) : null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-ink">Llamadas de cartera</h2>
      <p className="text-sm text-ink-muted">
        Cada día hábil a las 6:00 a.m. el CRM carga 10 clientes nuevos a cada vendedor. Lo que no registra se queda como
        atrasado y se acumula con lo nuevo. &quot;Contactos&quot; son las llamadas en las que sí contestaron (los últimos 7 días).
      </p>

      {agotadas.map((a) => (
        <div key={a.vendedorId} className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          ⚠️ Cartera de llamadas agotada para <strong>{a.nombre}</strong>: hoy faltaron{" "}
          <strong className="font-num">{a.faltaron}</strong> clientes para completar sus nuevas llamadas.
        </div>
      ))}

      <div className="rounded-lg border border-line bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-section text-ink-muted text-left">
            <tr>
              <th className="p-3">Vendedor</th>
              <th className="p-3">Registradas hoy</th>
              <th className="p-3">De hoy por hacer</th>
              <th className="p-3">Atrasadas</th>
              <th className="p-3">Más antigua (días)</th>
              <th className="p-3">7 días</th>
              <th className="p-3">Contactos</th>
              <th className="p-3">No contestó</th>
              <th className="p-3">Oportunidades</th>
            </tr>
          </thead>
          <tbody>
            {participantes.map((v) => {
              const f = porId.get(v.id);
              const meta = v.meta_llamadas_diarias ?? 0;
              const hoy = f?.hoy ?? 0;
              const atrasadas = f?.atrasadas ?? 0;
              const pausa = pausaActiva.get(v.id);
              return (
                <tr key={v.id} className="border-t">
                  <td className="p-3 font-medium text-ink">
                    {v.nombre}
                    {pausa && (
                      <span className="block text-xs font-normal text-amber-800" title={pausa.motivo}>
                        ⏸️ Sin cargas nuevas hasta {formatoFecha(pausa.hasta)}
                      </span>
                    )}
                  </td>
                  <td className={`p-3 font-num ${hoy >= meta ? "text-green-700 font-semibold" : ""}`}>
                    {hoy} de {meta}
                  </td>
                  <td className="p-3 font-num">{f?.deHoy ?? 0}</td>
                  <td className={`p-3 font-num ${atrasadas > 0 ? "text-red-700 font-semibold" : ""}`}>{atrasadas}</td>
                  <td className={`p-3 font-num ${(f?.diasMasAntigua ?? 0) > 0 ? "text-red-700" : ""}`}>
                    {(f?.diasMasAntigua ?? 0) > 0 ? f?.diasMasAntigua : ""}
                  </td>
                  <td className="p-3 font-num">{f?.semana ?? 0}</td>
                  <td className="p-3 font-num">{f?.contactos ?? 0}</td>
                  <td className="p-3 font-num">{f?.noContesto ?? 0}</td>
                  <td className="p-3 font-num font-semibold text-green-700">{f?.oportunidades ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <h3 className="font-semibold text-ink">Por día</h3>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setSemana((s) => s - 1)} className="px-3 py-1 rounded-md border border-line bg-card">
            ← Anterior
          </button>
          <span className="font-num text-ink-muted">
            {fmt(lunes)} – {fmt(domingo)}
          </span>
          <button
            onClick={() => setSemana((s) => Math.min(0, s + 1))}
            disabled={semana >= 0}
            className="px-3 py-1 rounded-md border border-line bg-card disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-section text-ink-muted text-left">
            <tr>
              <th className="p-3">Vendedor</th>
              {indicesVisibles.map((i) => (
                <th key={i} className="p-3 whitespace-nowrap">
                  {DIAS[i]} {fechasSemana[i].getDate()}
                </th>
              ))}
              <th className="p-3">Semana</th>
              <th className="p-3">Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            {porDia === null ? (
              <tr>
                <td className="p-3 text-ink-muted" colSpan={indicesVisibles.length + 3}>
                  Cargando...
                </td>
              </tr>
            ) : (
              <>
                {filasSemana.map(({ v, s }) => (
                  <tr key={v.id} className="border-t align-top">
                    <td className="p-3 font-medium text-ink whitespace-nowrap">{v.nombre}</td>
                    {indicesVisibles.map((i) => {
                      const d = s?.dias[i];
                      return (
                        <td key={i} className="p-3 font-num whitespace-nowrap">
                          {d && (d.asignadas > 0 || d.registradas > 0) ? (
                            <>
                              <span className="font-semibold">{d.registradas}</span>
                              <span className="text-ink-muted"> de {d.asignadas}</span>
                            </>
                          ) : (
                            <span className="text-ink-muted">–</span>
                          )}
                          {d && d.sinRegistrar !== null && d.sinRegistrar > 0 && (
                            <span className="block text-xs text-red-700">{d.sinRegistrar} sin registrar</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3 font-num whitespace-nowrap">
                      {s?.registradas ?? 0} de {s?.asignadas ?? 0}
                    </td>
                    <td
                      className={`p-3 font-num font-semibold ${
                        s?.cumplimiento == null ? "text-ink-muted" : s.cumplimiento >= 80 ? "text-green-700" : s.cumplimiento < 50 ? "text-red-700" : ""
                      }`}
                    >
                      {s?.cumplimiento == null ? "–" : `${s.cumplimiento}%`}
                    </td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="p-3">Total</td>
                  {indicesVisibles.map((i) => {
                    const reg = filasSemana.reduce((n, f) => n + (f.s?.dias[i].registradas ?? 0), 0);
                    const asig = filasSemana.reduce((n, f) => n + (f.s?.dias[i].asignadas ?? 0), 0);
                    return (
                      <td key={i} className="p-3 font-num whitespace-nowrap">
                        {reg} de {asig}
                      </td>
                    );
                  })}
                  <td className="p-3 font-num whitespace-nowrap">
                    {totalRegistradas} de {totalAsignadas}
                  </td>
                  <td className="p-3 font-num">{cumplimientoTotal == null ? "–" : `${cumplimientoTotal}%`}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        Cada celda: llamadas registradas de las asignadas ese día. &quot;Sin registrar&quot; son las que seguían pendientes al cerrar
        el día (incluye las atrasadas acumuladas). Cumplimiento = registradas entre asignadas de la semana (máximo 100%).
      </p>
    </section>
  );
}
