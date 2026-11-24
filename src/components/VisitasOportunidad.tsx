"use client";

import { useEffect, useState } from "react";
import {
  listarEvidencia,
  listarVisitasPorOportunidad,
  urlEvidencia,
} from "@/lib/data/visitas";
import { AgendarVisitaModal } from "@/components/AgendarVisitaModal";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Visita } from "@/lib/types";

interface Archivo {
  nombre: string;
  url: string | null;
  esImagen: boolean;
}

const ES_IMAGEN = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;

/**
 * Visitas ligadas a la oportunidad: fecha, vendedor, nota, estado y miniaturas
 * de la evidencia. La ve cualquiera que pueda ver la oportunidad; solo
 * administración y vendedores de campo ven el botón "Agendar visita".
 */
export function VisitasOportunidad({
  oportunidadId,
  cliente,
}: {
  oportunidadId: string;
  cliente: { id: string; empresa: string } | null;
}) {
  const { puedeVisitas } = useVendedorActual();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [evidencia, setEvidencia] = useState<Record<string, Archivo[]>>({});
  const [cargando, setCargando] = useState(true);
  const [agendando, setAgendando] = useState(false);

  async function cargar() {
    const vs = await listarVisitasPorOportunidad(oportunidadId).catch(() => [] as Visita[]);
    setVisitas(vs);
    setCargando(false);
    const mapa: Record<string, Archivo[]> = {};
    await Promise.all(
      vs.map(async (v) => {
        const archivos = await listarEvidencia(v.id).catch(() => []);
        mapa[v.id] = await Promise.all(
          archivos.map(async (a) => ({
            nombre: a.name,
            url: await urlEvidencia(a.path),
            esImagen: ES_IMAGEN.test(a.name),
          }))
        );
      })
    );
    setEvidencia(mapa);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadId]);

  // Quien no hace visitas y no hay ninguna ligada: no hay nada que mostrar.
  if (!cargando && visitas.length === 0 && !puedeVisitas) return null;

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ink">Visitas</p>
        {puedeVisitas && cliente && (
          <button
            onClick={() => setAgendando(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-brand text-white"
          >
            Agendar visita
          </button>
        )}
      </div>

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : visitas.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no hay visitas ligadas a esta oportunidad.</p>
      ) : (
        <ul className="space-y-3">
          {visitas.map((v) => (
            <li key={v.id} className="text-sm border-b border-line last:border-0 pb-3 last:pb-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium text-ink">
                  {new Date(v.fecha + "T00:00:00").toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  — {v.vendedor?.nombre || "Vendedor"}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    v.estado === "realizada"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {v.estado === "realizada" ? "Realizada" : "Agendada"}
                </span>
              </div>
              {v.notas && <p className="text-sm text-ink mt-1">📝 {v.notas}</p>}
              {(evidencia[v.id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(evidencia[v.id] ?? []).map((a) =>
                    a.url && a.esImagen ? (
                      <a key={a.nombre} href={a.url} target="_blank" rel="noreferrer" title={a.nombre}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url}
                          alt={a.nombre}
                          className="h-16 w-16 object-cover rounded-md border border-line"
                        />
                      </a>
                    ) : a.url ? (
                      <a
                        key={a.nombre}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand underline self-center"
                      >
                        📎 {a.nombre}
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {agendando && cliente && (
        <AgendarVisitaModal
          cliente={cliente}
          oportunidadId={oportunidadId}
          onCancel={() => setAgendando(false)}
          onCreada={() => {
            setAgendando(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}
