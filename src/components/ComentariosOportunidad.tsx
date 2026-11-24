"use client";

import { useState } from "react";
import { borrarComentario, crearComentario } from "@/lib/data/comentarios";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Comentario } from "@/lib/types";

const CINCO_MIN = 5 * 60 * 1000;

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Un comentario con su autor, fecha y hora (y el botón de borrar si es tuyo y aún no pasan 5 minutos). */
export function ComentarioItem({
  c,
  nuevo,
  contexto,
  onCambio,
}: {
  c: Comentario;
  /** Marca visual "Nuevo" (comentario que el dueño todavía no había leído al abrir la página). */
  nuevo?: boolean;
  /** Texto opcional, p. ej. "sobre: Día 5 — Seguimiento 1". */
  contexto?: string | null;
  onCambio: () => void;
}) {
  const { vendedor } = useVendedorActual();
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [ahora] = useState(() => Date.now());

  const esMio = !!vendedor && c.autor_id === vendedor.id;
  const puedeBorrar = esMio && ahora - new Date(c.creado_en).getTime() < CINCO_MIN;
  const esGerencia = c.autor?.rol === "admin" || c.autor?.rol === "admin_unidad";

  async function onBorrar() {
    if (!window.confirm("¿Borrar este comentario? Solo se puede en los primeros 5 minutos.")) return;
    setBorrando(true);
    setError(null);
    try {
      await borrarComentario(c.id);
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
      setBorrando(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-section/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="flex items-center gap-2 flex-wrap">
          <strong className="text-ink">{c.autor?.nombre || "Usuario"}</strong>
          {esGerencia && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              Gerencia
            </span>
          )}
          {nuevo && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand text-white">Nuevo</span>
          )}
        </p>
        <span className="font-num text-xs text-ink-muted">{fechaHora(c.creado_en)}</span>
      </div>
      {contexto && <p className="text-xs text-ink-muted mt-0.5">{contexto}</p>}
      <p className="text-ink mt-1 whitespace-pre-wrap">{c.texto}</p>
      {puedeBorrar && (
        <button
          onClick={onBorrar}
          disabled={borrando}
          className="text-xs text-red-700 underline mt-1 disabled:opacity-50"
        >
          {borrando ? "Borrando..." : "Borrar (disponible 5 min)"}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  );
}

/** Caja de texto + botón "Comentar", ligada a la oportunidad (y opcionalmente a un seguimiento). */
export function CajaComentario({
  oportunidadId,
  seguimientoId,
  etiquetaBoton = "Comentar",
  placeholder = "Escribe tu comentario…",
  onCreado,
}: {
  oportunidadId: string;
  seguimientoId: string | null;
  etiquetaBoton?: string;
  placeholder?: string;
  onCreado: () => void;
}) {
  const { vendedor } = useVendedorActual();
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onComentar() {
    if (!vendedor || texto.trim().length === 0) return;
    setGuardando(true);
    setError(null);
    try {
      await crearComentario({
        oportunidad_id: oportunidadId,
        seguimiento_id: seguimientoId,
        autor_id: vendedor.id,
        texto,
      });
      setTexto("");
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el comentario");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={onComentar}
        disabled={guardando || !vendedor || texto.trim().length === 0}
        className="bg-brand text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {guardando ? "Guardando..." : etiquetaBoton}
      </button>
    </div>
  );
}

/** Botón "Comentar este seguimiento" que despliega la caja debajo del seguimiento. */
export function ComentarSeguimiento({
  oportunidadId,
  seguimientoId,
  onCreado,
}: {
  oportunidadId: string;
  seguimientoId: string;
  onCreado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="text-xs text-brand underline">
        💬 Comentar este seguimiento
      </button>
    );
  }
  return (
    <div className="mt-2">
      <CajaComentario
        oportunidadId={oportunidadId}
        seguimientoId={seguimientoId}
        etiquetaBoton="Comentar"
        placeholder="Comentario sobre este seguimiento…"
        onCreado={() => {
          setAbierto(false);
          onCreado();
        }}
      />
      <button onClick={() => setAbierto(false)} className="text-xs text-ink-muted underline mt-1">
        Cancelar
      </button>
    </div>
  );
}
