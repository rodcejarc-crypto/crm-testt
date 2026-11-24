"use client";

import { useEffect, useState } from "react";
import {
  borrarDocumento,
  listarDocumentos,
  subirDocumento,
  urlDocumento,
  type ArchivoDocumento,
  type CategoriaDocumento,
} from "@/lib/data/documentos";

export function AdjuntosOportunidad({
  oportunidadId,
  categoria,
  titulo,
}: {
  oportunidadId: string;
  categoria: CategoriaDocumento;
  titulo: string;
}) {
  const [archivos, setArchivos] = useState<ArchivoDocumento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      setArchivos(await listarDocumentos(oportunidadId, categoria));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadId, categoria]);

  async function onSubir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      await subirDocumento(oportunidadId, categoria, file);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
      e.target.value = "";
    }
  }

  async function onVer(path: string) {
    const url = await urlDocumento(path);
    if (url) window.open(url, "_blank");
  }

  async function onBorrar(path: string) {
    await borrarDocumento(path);
    await cargar();
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-2">
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : archivos.length === 0 ? (
        <p className="text-sm text-ink-muted">Todavía no hay archivos.</p>
      ) : (
        <ul className="space-y-1">
          {archivos.map((a) => (
            <li key={a.path} className="flex items-center justify-between text-sm">
              <button onClick={() => onVer(a.path)} className="text-brand underline truncate">
                {a.name}
              </button>
              <button onClick={() => onBorrar(a.path)} className="text-xs text-red-600 underline ml-2">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="inline-block text-sm px-3 py-1.5 rounded-md border border-line cursor-pointer">
        {subiendo ? "Subiendo..." : "+ Adjuntar archivo"}
        <input
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={onSubir}
          disabled={subiendo}
        />
      </label>
    </div>
  );
}
