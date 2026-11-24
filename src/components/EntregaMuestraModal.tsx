"use client";

import { useState } from "react";
import { registrarEntregaMuestra, subirEvidenciaMuestra } from "@/lib/data/muestras";
import {
  fechaFinPrueba,
  formatoFechaCorta,
  hoyIso,
  proponerSeguimientos,
  type SeguimientoPropuesto,
} from "@/lib/muestras";
import type { Muestra, UnidadPrueba } from "@/lib/types";

const inputCls =
  "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand";

export function EntregaMuestraModal({
  muestra,
  onClose,
  onHecho,
}: {
  muestra: Muestra;
  onClose: () => void;
  onHecho: () => void;
}) {
  const valorInicial = muestra.prueba_valor ?? 30;
  const unidadInicial = (muestra.prueba_unidad ?? "dias") as UnidadPrueba;

  const [fecha, setFecha] = useState(hoyIso());
  const [forma, setForma] = useState("en_persona");
  const [recibio, setRecibio] = useState("");
  const [valor, setValor] = useState(String(valorInicial));
  const [unidad, setUnidad] = useState<UnidadPrueba>(unidadInicial);
  const [evalNombre, setEvalNombre] = useState(muestra.ficha_cliente?.quien_evalua ?? "");
  const [evalContacto, setEvalContacto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [segs, setSegs] = useState<SeguimientoPropuesto[]>(() =>
    proponerSeguimientos(hoyIso(), valorInicial, unidadInicial)
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoRecalculo, setAvisoRecalculo] = useState(false);

  const fin = Number(valor) > 0 ? fechaFinPrueba(fecha, Number(valor), unidad) : null;

  function recalcular(f: string, v: string, u: UnidadPrueba) {
    if (!f || !(Number(v) > 0)) return;
    // Conserva lo que el vendedor escribió a mano (notas y horas de las filas
    // que siguen existiendo) pero vuelve a proponer las fechas.
    const nuevos = proponerSeguimientos(f, Number(v), u);
    setSegs((prev) => {
      const extras = prev.filter((s) => s.rol === "extra");
      return [...nuevos.map((n) => {
        const previo = prev.find((p) => p.clave === n.clave);
        return previo ? { ...n, hora: previo.hora, detalle: previo.detalle } : n;
      }), ...extras].sort((a, b) => a.fecha.localeCompare(b.fecha));
    });
    setAvisoRecalculo(true);
  }

  function cambiarSeg(i: number, cambios: Partial<SeguimientoPropuesto>) {
    setSegs((prev) => prev.map((s, j) => (j === i ? { ...s, ...cambios } : s)));
  }

  async function onGuardar() {
    setError(null);
    if (!fecha || !recibio.trim() || !evalNombre.trim()) {
      setError("Completa la fecha, quién recibió la muestra y quién la evalúa.");
      return;
    }
    if (!(Number(valor) > 0)) {
      setError("Indica la duración de la prueba.");
      return;
    }
    if (archivos.length === 0) {
      setError("Sube la foto o el acuse firmado de la entrega.");
      return;
    }
    if (segs.some((s) => s.rol !== "final" && (!s.fecha || !s.nombre.trim()))) {
      setError("Cada seguimiento necesita nombre y fecha (o bórralo).");
      return;
    }
    setGuardando(true);
    try {
      for (const f of archivos) await subirEvidenciaMuestra(muestra.id, f);
      await registrarEntregaMuestra({
        muestraId: muestra.id,
        fecha,
        forma,
        recibio,
        valor: Number(valor),
        unidad,
        evaluadorNombre: evalNombre,
        evaluadorContacto: evalContacto,
        seguimientos: segs.map((s) => ({
          nombre: s.nombre.trim(),
          fecha: s.rol === "final" ? (fin ?? s.fecha) : s.fecha,
          hora: s.hora,
          detalle: s.detalle,
          rol: s.rol,
        })),
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la entrega");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-2xl mx-auto my-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink">Registrar entrega de la muestra</h3>
            <p className="text-xs text-ink-muted">
              Al guardar, la muestra pasa a “en prueba” y tus seguimientos quedan programados.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-muted text-sm">
            ✕ Cerrar
          </button>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-ink-muted mb-1">Fecha de entrega</span>
            <input
              type="date"
              className={inputCls}
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                recalcular(e.target.value, valor, unidad);
              }}
            />
          </label>
          <label className="text-sm">
            <span className="block text-ink-muted mb-1">Forma de entrega</span>
            <select className={inputCls} value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="en_persona">En persona</option>
              <option value="paqueteria">Paquetería</option>
              <option value="cliente_recoge">El cliente recoge</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="block text-ink-muted mb-1">¿Quién la recibió?</span>
            <input className={inputCls} value={recibio} onChange={(e) => setRecibio(e.target.value)} />
          </label>
        </section>

        <section className="space-y-2">
          <p className="text-sm text-ink-muted">Evidencia de la entrega (foto o acuse firmado)</p>
          {archivos.length > 0 && (
            <ul className="text-sm space-y-1">
              {archivos.map((f, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate">{f.name}</span>
                  <button
                    onClick={() => setArchivos((p) => p.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 underline ml-2"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="inline-block text-sm px-3 py-1.5 rounded-md border border-line cursor-pointer">
            + Subir foto / archivo
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setArchivos((p) => [...p, f]);
                e.target.value = "";
              }}
            />
          </label>
        </section>

        <section className="space-y-2">
          <p className="text-sm text-ink-muted">Duración de la prueba</p>
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="number"
              min={1}
              className={`${inputCls} w-28 font-num`}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                recalcular(fecha, e.target.value, unidad);
              }}
            />
            <select
              className={`${inputCls} w-40`}
              value={unidad}
              onChange={(e) => {
                setUnidad(e.target.value as UnidadPrueba);
                recalcular(fecha, valor, e.target.value as UnidadPrueba);
              }}
            >
              <option value="dias">días</option>
              <option value="semanas">semanas</option>
              <option value="meses">meses</option>
            </select>
            {fin && (
              <p className="text-sm text-ink">
                Fin de prueba: <strong>{formatoFechaCorta(fin)}</strong>
              </p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-ink-muted mb-1">Persona del cliente que evalúa la muestra</span>
            <input className={inputCls} value={evalNombre} onChange={(e) => setEvalNombre(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="block text-ink-muted mb-1">Su teléfono o correo</span>
            <input className={inputCls} value={evalContacto} onChange={(e) => setEvalContacto(e.target.value)} />
          </label>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold text-ink">Tus seguimientos de la prueba</p>
          <p className="text-xs text-ink-muted">
            Ya propuse las fechas según la duración; puedes cambiarlas o borrarlas. La evaluación final
            queda siempre en la fecha fin y no se puede borrar.
            {avisoRecalculo && " (Se recalcularon al cambiar la fecha o la duración.)"}
          </p>
          <ul className="space-y-3">
            {segs.map((s, i) => (
              <li key={`${s.clave}-${i}`} className="rounded-md border border-line p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="Nombre del seguimiento"
                    value={s.nombre}
                    onChange={(e) => cambiarSeg(i, { nombre: e.target.value })}
                  />
                  {s.rol === "final" ? (
                    <span className="text-xs text-ink-muted whitespace-nowrap">no se puede borrar</span>
                  ) : (
                    <button
                      onClick={() => setSegs((p) => p.filter((_, j) => j !== i))}
                      className="text-ink-muted hover:text-brand text-lg"
                      title="Borrar seguimiento"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="date"
                    className={`${inputCls} w-44`}
                    value={s.rol === "final" ? (fin ?? s.fecha) : s.fecha}
                    disabled={s.rol === "final"}
                    onChange={(e) => cambiarSeg(i, { fecha: e.target.value })}
                  />
                  <input
                    type="time"
                    className={`${inputCls} w-32`}
                    value={s.hora}
                    onChange={(e) => cambiarSeg(i, { hora: e.target.value })}
                    title="Hora (opcional)"
                  />
                </div>
                <input
                  className={inputCls}
                  placeholder="¿Qué se va a validar? (ej. preguntar por desgaste de suela)"
                  value={s.detalle}
                  onChange={(e) => cambiarSeg(i, { detalle: e.target.value })}
                />
              </li>
            ))}
          </ul>
          <button
            onClick={() =>
              setSegs((p) => [
                ...p,
                { clave: `extra${Date.now()}`, nombre: "", fecha: sumar(fecha), hora: "", detalle: "", rol: "extra" },
              ])
            }
            className="text-sm px-3 py-1.5 rounded-md border border-line"
          >
            + Agregar seguimiento
          </button>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar entrega"}
          </button>
          <button onClick={onClose} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function sumar(fecha: string): string {
  const d = new Date(fecha + "T12:00:00");
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
