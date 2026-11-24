"use client";

import { useState } from "react";
import { crearSolicitudMuestra } from "@/lib/data/muestras";
import { LINEAS_PEDIDO } from "@/lib/types";
import type { UnidadPrueba } from "@/lib/types";

// Conocimiento del cliente: todos los campos son obligatorios.
const CAMPOS: { clave: string; etiqueta: string; ayuda?: string; area?: boolean; numero?: boolean }[] = [
  { clave: "giro", etiqueta: "¿A qué se dedica la empresa?", area: true },
  { clave: "trabajadores", etiqueta: "¿Cuántos trabajadores usan calzado?", numero: true },
  { clave: "calzado_actual", etiqueta: "¿Qué calzado usa hoy?" },
  { clave: "marca_actual", etiqueta: "¿De qué marca?" },
  { clave: "precio_actual", etiqueta: "¿A qué precio lo compra?" },
  { clave: "problema", etiqueta: "¿Qué problema tiene con su calzado actual, o por qué evalúa cambiar?", area: true },
  { clave: "req_norma", etiqueta: "Requisito técnico: norma" },
  { clave: "req_casquillo", etiqueta: "Requisito técnico: casquillo" },
  { clave: "req_suela", etiqueta: "Requisito técnico: tipo de suela" },
  { clave: "req_material", etiqueta: "Requisito técnico: ¿piel o PVC?" },
  { clave: "req_ambiente", etiqueta: "Requisito técnico: ambiente de trabajo" },
  { clave: "volumen_anual", etiqueta: "Volumen potencial de compra (pares al año)", numero: true },
  { clave: "frecuencia", etiqueta: "Frecuencia de compra" },
  { clave: "quien_decide", etiqueta: "¿Quién decide la compra?" },
  { clave: "quien_evalua", etiqueta: "¿Quién evalúa la muestra?" },
  { clave: "competidores", etiqueta: "¿Con qué competidores nos compara?", area: true },
];

interface Renglon {
  estilo: string;
  linea: string;
  talla: string;
  pares: string;
}

const RENGLON_VACIO: Renglon = { estilo: "", linea: "", talla: "", pares: "" };

export function SolicitarMuestrasModal({
  oportunidadId,
  tieneValor,
  onClose,
  onCreada,
}: {
  oportunidadId: string;
  /** La oportunidad tiene valor estimado capturado. */
  tieneValor: boolean;
  onClose: () => void;
  onCreada: () => void;
}) {
  const [ficha, setFicha] = useState<Record<string, string>>({});
  const [necesidad, setNecesidad] = useState("");
  const [modelos, setModelos] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([{ ...RENGLON_VACIO }]);
  const [valor, setValor] = useState("30");
  const [unidad, setUnidad] = useState<UnidadPrueba>("dias");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[] | null>(null);

  const total = renglones.reduce((s, r) => s + (Number(r.pares) || 0), 0);

  function validar(): string | null {
    for (const c of CAMPOS) {
      if (!(ficha[c.clave] ?? "").trim()) return `Falta: ${c.etiqueta}`;
    }
    if (!necesidad.trim()) return "Falta explicar por qué las muestras son necesarias para cerrar.";
    if (!modelos.trim()) return "Falta explicar por qué esos modelos y esa cantidad.";
    const utiles = renglones.filter((r) => r.estilo.trim() || r.pares);
    if (utiles.length === 0) return "Agrega al menos un renglón (estilo, talla y cantidad).";
    for (const r of utiles) {
      if (!r.estilo.trim() || !r.linea || !(Number(r.pares) > 0)) {
        return "Cada renglón necesita estilo, línea y una cantidad mayor a cero.";
      }
    }
    if (!(Number(valor) > 0)) return "Indica los días de prueba propuestos.";
    return null;
  }

  async function enviar(confirmado: boolean) {
    setError(null);
    const msj = validar();
    if (msj) {
      setError(msj);
      return;
    }
    if (!confirmado) {
      const av: string[] = [];
      if (total > 3) av.push(`La cantidad total es de ${total} pares y supera los 3 pares.`);
      if (!tieneValor) av.push("La oportunidad no tiene un valor estimado capturado.");
      if (av.length > 0) {
        setAvisos(av);
        return;
      }
    }
    setGuardando(true);
    try {
      await crearSolicitudMuestra({
        oportunidadId,
        ficha,
        justificacionNecesidad: necesidad,
        justificacionModelos: modelos,
        pruebaValor: Number(valor),
        pruebaUnidad: unidad,
        renglones: renglones
          .filter((r) => r.estilo.trim() || r.pares)
          .map((r) => ({ estilo: r.estilo.trim(), linea: r.linea, talla: r.talla.trim(), pares: Number(r.pares) })),
      });
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud");
      setGuardando(false);
    }
  }

  const inputCls =
    "w-full border border-line bg-card text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 p-4 overflow-y-auto">
      <div className="bg-card rounded-lg p-5 w-full max-w-2xl mx-auto my-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-ink">Solicitar muestras</h3>
            <p className="text-xs text-ink-muted">
              Un Administrador la revisa y la aprueba o la rechaza. Todos los campos son obligatorios.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-muted text-sm">
            ✕ Cerrar
          </button>
        </div>

        <section className="space-y-3">
          <h4 className="font-display text-xs uppercase tracking-wide text-ink-muted">Conocimiento del cliente</h4>
          {CAMPOS.map((c) => (
            <label key={c.clave} className="block text-sm">
              <span className="block text-ink-muted mb-1">{c.etiqueta}</span>
              {c.area ? (
                <textarea
                  rows={2}
                  className={inputCls}
                  value={ficha[c.clave] ?? ""}
                  onChange={(e) => setFicha({ ...ficha, [c.clave]: e.target.value })}
                />
              ) : (
                <input
                  type={c.numero ? "number" : "text"}
                  min={c.numero ? 0 : undefined}
                  className={inputCls}
                  value={ficha[c.clave] ?? ""}
                  onChange={(e) => setFicha({ ...ficha, [c.clave]: e.target.value })}
                />
              )}
            </label>
          ))}
        </section>

        <section className="space-y-3">
          <h4 className="font-display text-xs uppercase tracking-wide text-ink-muted">Justificación de las muestras</h4>
          <label className="block text-sm">
            <span className="block text-ink-muted mb-1">¿Por qué son necesarias para cerrar la venta?</span>
            <textarea rows={2} className={inputCls} value={necesidad} onChange={(e) => setNecesidad(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="block text-ink-muted mb-1">¿Por qué esos modelos y esa cantidad?</span>
            <textarea rows={2} className={inputCls} value={modelos} onChange={(e) => setModelos(e.target.value)} />
          </label>
        </section>

        <section className="space-y-2">
          <h4 className="font-display text-xs uppercase tracking-wide text-ink-muted">Renglones de la muestra</h4>
          {renglones.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <input
                className={`${inputCls} col-span-12 sm:col-span-4`}
                placeholder="Estilo / referencia"
                value={r.estilo}
                onChange={(e) => setRenglones((p) => p.map((x, j) => (j === i ? { ...x, estilo: e.target.value } : x)))}
              />
              <select
                className={`${inputCls} col-span-6 sm:col-span-3`}
                value={r.linea}
                onChange={(e) => setRenglones((p) => p.map((x, j) => (j === i ? { ...x, linea: e.target.value } : x)))}
              >
                <option value="">Línea…</option>
                {LINEAS_PEDIDO.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                className={`${inputCls} col-span-3 sm:col-span-2`}
                placeholder="Talla"
                value={r.talla}
                onChange={(e) => setRenglones((p) => p.map((x, j) => (j === i ? { ...x, talla: e.target.value } : x)))}
              />
              <input
                type="number"
                min={1}
                className={`${inputCls} col-span-3 sm:col-span-2 font-num text-right`}
                placeholder="Pares"
                value={r.pares}
                onChange={(e) => setRenglones((p) => p.map((x, j) => (j === i ? { ...x, pares: e.target.value } : x)))}
              />
              <button
                type="button"
                onClick={() => setRenglones((p) => (p.length === 1 ? [{ ...RENGLON_VACIO }] : p.filter((_, j) => j !== i)))}
                className="col-span-12 sm:col-span-1 text-ink-muted hover:text-brand text-lg"
                title="Quitar renglón"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRenglones((p) => [...p, { ...RENGLON_VACIO }])}
              className="text-sm px-3 py-1.5 rounded-md border border-line"
            >
              + Agregar otro renglón
            </button>
            <p className="text-sm text-ink-muted">
              Total: <strong className="font-num text-ink">{total}</strong> pares
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="font-display text-xs uppercase tracking-wide text-ink-muted">Días de prueba propuestos</h4>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              className={`${inputCls} w-28 font-num`}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            <select className={`${inputCls} w-40`} value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadPrueba)}>
              <option value="dias">días</option>
              <option value="semanas">semanas</option>
              <option value="meses">meses</option>
            </select>
          </div>
        </section>

        {avisos && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 space-y-1">
            <p className="font-semibold">Antes de enviar, ten en cuenta:</p>
            <ul className="list-disc pl-5">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => enviar(!!avisos)}
            disabled={guardando}
            className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {guardando ? "Enviando..." : avisos ? "Enviar de todos modos" : "Enviar solicitud"}
          </button>
          <button onClick={onClose} disabled={guardando} className="text-sm px-4 py-2 rounded-md border border-line">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
