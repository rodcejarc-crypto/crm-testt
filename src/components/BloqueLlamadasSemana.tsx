"use client";

import { useEffect, useState } from "react";
import { etiquetaMotivo, llamadasEnRango, RESULTADO_LLAMADA, type LlamadaSemana } from "@/lib/data/llamadas";
import type { ResultadoLlamada, Vendedor } from "@/lib/types";

const COLUMNAS: ResultadoLlamada[] = [
  "contesto_interesado",
  "contesto_no_interesa",
  "no_contesto",
  "numero_equivocado",
  "llamar_despues",
  "misma_razon_social",
  "gestion_activa",
  "no_apto",
  "otro",
];

const CORTO: Record<ResultadoLlamada, string> = {
  contesto_interesado: "Le interesa",
  contesto_no_interesa: "No le interesa",
  no_contesto: "No contestó",
  numero_equivocado: "Núm. equivocado",
  llamar_despues: "Llamar después",
  misma_razon_social: "Otra razón social",
  gestion_activa: "Gestión activa",
  no_apto: "No apto",
  otro: "Otro",
};

function inicioDeSemana(desplazamiento: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia + desplazamiento * 7);
  return d;
}

/** Llamadas de cartera por vendedor y por semana: resultados, descartes por motivo y oportunidades creadas. */
export function BloqueLlamadasSemana({ vendedores }: { vendedores: Vendedor[] }) {
  const [semana, setSemana] = useState(0);
  const [llamadas, setLlamadas] = useState<LlamadaSemana[] | null>(null);

  const inicio = inicioDeSemana(semana);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);
  const finVisible = new Date(fin);
  finVisible.setDate(finVisible.getDate() - 1);
  const clave = inicio.toISOString();

  useEffect(() => {
    let vigente = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLlamadas(null);
    llamadasEnRango(inicio.toISOString(), fin.toISOString())
      .then((l) => vigente && setLlamadas(l))
      .catch(() => vigente && setLlamadas([]));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const participantes = vendedores.filter((v) => (v.meta_llamadas_diarias ?? 0) > 0);
  if (participantes.length === 0) return null;

  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });

  const filas = participantes.map((v) => {
    const mias = (llamadas ?? []).filter((l) => l.vendedor_id === v.id);
    const porResultado = Object.fromEntries(COLUMNAS.map((r) => [r, mias.filter((l) => l.resultado === r).length])) as Record<
      ResultadoLlamada,
      number
    >;
    const descartes = new Map<string, number>();
    for (const l of mias.filter((x) => x.resultado === "no_apto")) {
      descartes.set(l.motivo ?? "", (descartes.get(l.motivo ?? "") ?? 0) + 1);
    }
    return {
      v,
      total: mias.length,
      porResultado,
      descartes: [...descartes.entries()].map(([m, n]) => `${etiquetaMotivo(m)} (${n})`),
      oportunidades: mias.filter((l) => l.oportunidad_id).length,
    };
  });

  const totales = COLUMNAS.map((r) => filas.reduce((s, f) => s + f.porResultado[r], 0));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-ink">Llamadas de cartera por semana</h2>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setSemana((s) => s - 1)} className="px-3 py-1 rounded-md border border-line bg-card">
            ← Anterior
          </button>
          <span className="font-num text-ink-muted">
            {fmt(inicio)} – {fmt(finVisible)}
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
              <th className="p-3">Llamadas</th>
              {COLUMNAS.map((r) => (
                <th key={r} className="p-3" title={RESULTADO_LLAMADA[r].label}>
                  {CORTO[r]}
                </th>
              ))}
              <th className="p-3">Oportunidades creadas</th>
            </tr>
          </thead>
          <tbody>
            {llamadas === null ? (
              <tr>
                <td className="p-3 text-ink-muted" colSpan={COLUMNAS.length + 3}>
                  Cargando...
                </td>
              </tr>
            ) : (
              <>
                {filas.map((f) => (
                  <tr key={f.v.id} className="border-t">
                    <td className="p-3 font-medium text-ink whitespace-nowrap">{f.v.nombre}</td>
                    <td className="p-3 font-num font-semibold">{f.total}</td>
                    {COLUMNAS.map((r) => (
                      <td key={r} className="p-3 font-num">
                        {f.porResultado[r] || ""}
                      </td>
                    ))}
                    <td className="p-3 font-num font-semibold text-green-700">{f.oportunidades || ""}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="p-3">Total</td>
                  <td className="p-3 font-num">{filas.reduce((s, f) => s + f.total, 0)}</td>
                  {totales.map((n, i) => (
                    <td key={COLUMNAS[i]} className="p-3 font-num">
                      {n || ""}
                    </td>
                  ))}
                  <td className="p-3 font-num text-green-700">{filas.reduce((s, f) => s + f.oportunidades, 0)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {llamadas !== null && filas.some((f) => f.descartes.length > 0) && (
        <div className="rounded-lg border border-line bg-card p-3 text-sm space-y-1">
          <p className="font-semibold text-ink">Clientes descartados por motivo (esta semana)</p>
          {filas
            .filter((f) => f.descartes.length > 0)
            .map((f) => (
              <p key={f.v.id} className="text-ink-muted">
                <span className="text-ink">{f.v.nombre}:</span> {f.descartes.join(" · ")}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
