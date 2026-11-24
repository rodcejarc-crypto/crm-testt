"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  asignarGrupo,
  buscarGrupos,
  crearGrupo,
  miembrosDelGrupo,
  obtenerGrupo,
} from "@/lib/data/grupos";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { GrupoCliente as Grupo } from "@/lib/types";

type Miembros = Awaited<ReturnType<typeof miembrosDelGrupo>>;

export function GrupoCliente({
  clienteId,
  grupoId,
  onCambio,
}: {
  clienteId: string;
  grupoId: string | null;
  onCambio: () => void;
}) {
  const { vendedor } = useVendedorActual();
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [miembros, setMiembros] = useState<Miembros | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [sugeridos, setSugeridos] = useState<Grupo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    if (!grupoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGrupo(null);
      setMiembros(null);
      return;
    }
    Promise.all([obtenerGrupo(grupoId), miembrosDelGrupo(grupoId)])
      .then(([g, m]) => {
        if (!activo) return;
        setGrupo(g);
        setMiembros(m);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [grupoId]);

  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => {
      buscarGrupos(texto)
        .then(setSugeridos)
        .catch(() => setSugeridos([]));
    }, 250);
    return () => clearTimeout(t);
  }, [abierto, texto]);

  async function elegir(id: string | null, nombreNuevo?: string) {
    setGuardando(true);
    setError(null);
    try {
      let destino = id;
      if (!destino && nombreNuevo) {
        destino = (await crearGrupo(nombreNuevo, vendedor?.id ?? null)).id;
      }
      await asignarGrupo(clienteId, destino);
      setAbierto(false);
      setTexto("");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const limpio = texto.trim();
  const yaExiste = sugeridos.some((g) => g.nombre.trim().toLowerCase() === limpio.toLowerCase());
  const otros = miembros ? miembros.visibles.filter((m) => m.id !== clienteId) : [];
  const ocultos = miembros ? Math.max(0, miembros.total - miembros.visibles.length) : 0;

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-ink">Grupo o razón social</p>
        {!abierto && (
          <button
            onClick={() => setAbierto(true)}
            className="text-sm px-3 py-1.5 rounded-md border border-line bg-card text-ink"
          >
            {grupoId ? "Cambiar de grupo" : "Este cliente pertenece a otro grupo o razón social"}
          </button>
        )}
      </div>

      {grupoId && grupo && (
        <div className="text-sm space-y-2">
          <p>
            Pertenece al grupo <strong className="text-ink">{grupo.nombre}</strong>
          </p>
          {miembros && (otros.length > 0 || ocultos > 0) && (
            <div>
              <p className="text-xs text-ink-muted mb-1">Otras razones sociales del mismo grupo:</p>
              <ul className="space-y-1">
                {otros.map((m) => (
                  <li key={m.id}>
                    <Link href={`/clientes/${m.id}`} className="text-brand underline">
                      {m.empresa}
                    </Link>
                    <span className="text-ink-muted text-xs">
                      {m.rfc ? ` · ${m.rfc}` : ""}
                      {m.ciudad ? ` · ${m.ciudad}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {ocultos > 0 && (
                <p className="text-xs text-ink-muted mt-1">
                  + {ocultos} {ocultos === 1 ? "razón social más" : "razones sociales más"} que
                  atiende otro vendedor.
                </p>
              )}
            </div>
          )}
          {!abierto && (
            <button
              onClick={() => elegir(null)}
              disabled={guardando}
              className="text-xs text-ink-muted underline"
            >
              Quitar de este grupo
            </button>
          )}
        </div>
      )}

      {!grupoId && !abierto && (
        <p className="text-xs text-ink-muted">
          Si este cliente factura a nombre de otra razón social o forma parte de una empresa más
          grande, agrúpalo aquí. Puedes ir organizándolos poco a poco.
        </p>
      )}

      {abierto && (
        <div className="space-y-2">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busca el grupo o escribe el nombre de uno nuevo…"
            className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          />
          <ul className="border border-line rounded-md divide-y divide-line bg-card max-h-52 overflow-y-auto">
            {sugeridos.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => elegir(g.id)}
                  disabled={guardando || g.id === grupoId}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-section disabled:opacity-50"
                >
                  {g.nombre}
                  {g.id === grupoId && <span className="text-xs text-ink-muted"> (actual)</span>}
                </button>
              </li>
            ))}
            {limpio && !yaExiste && (
              <li>
                <button
                  onClick={() => elegir(null, limpio)}
                  disabled={guardando}
                  className="w-full text-left px-3 py-2 text-sm text-brand hover:bg-section"
                >
                  + Crear el grupo «{limpio}» y agrupar este cliente
                </button>
              </li>
            )}
            {sugeridos.length === 0 && !limpio && (
              <li className="px-3 py-2 text-xs text-ink-muted">
                Todavía no hay grupos. Escribe un nombre para crear el primero.
              </li>
            )}
          </ul>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => {
              setAbierto(false);
              setTexto("");
            }}
            className="text-sm px-3 py-1.5 rounded-md border border-line"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
