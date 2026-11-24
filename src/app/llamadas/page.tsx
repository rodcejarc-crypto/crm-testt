"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { descargarExcel } from "@/lib/excel";
import { listarVendedores } from "@/lib/data/vendedores";
import { etiquetaMotivo, listarBitacoraLlamadas, RESULTADO_LLAMADA, type FilaBitacora } from "@/lib/data/llamadas";
import type { ResultadoLlamada, Vendedor } from "@/lib/types";

const aTexto = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Qué más quedó registrado según el resultado (otra razón social, quién la trabaja, motivo de descarte). */
function detalleExtra(f: FilaBitacora): string {
  if (f.resultado === "misma_razon_social" && f.relacionado) return `Otra razón social: ${f.relacionado.empresa}`;
  if (f.resultado === "gestion_activa" && f.gestionado) return `Lo trabaja: ${f.gestionado.nombre}`;
  if (f.resultado === "no_apto") return `Motivo: ${etiquetaMotivo(f.motivo)}`;
  return "";
}

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};

/** A dónde pasa el cliente después de la llamada (misma lógica que usa la asignación diaria). */
function queSigue(f: FilaBitacora): string {
  switch (f.resultado) {
    case "contesto_interesado":
      return f.oportunidad_id ? "Pasó a Ventas como oportunidad (Contacto efectivo)." : "Ya tenía una oportunidad abierta; sigue en Ventas.";
    case "contesto_no_interesa":
      return `Sale de tu lista. Vuelve a salir a partir del ${sumarDias(f.creado_en, 180)}.`;
    case "no_contesto":
      return `Se intenta de nuevo a partir del ${sumarDias(f.creado_en, 30)} (máximo 3 intentos).`;
    case "numero_equivocado":
      return "Se borró su teléfono. Corrígelo en su ficha de cliente.";
    case "llamar_despues":
      return "Quedó en Seguimientos para la fecha que acordaron.";
    case "misma_razon_social":
      return "Ligado a la otra razón social. No vuelve a tu lista.";
    case "gestion_activa":
      return "No vuelve a tu lista mientras esa oportunidad siga abierta.";
    case "no_apto":
      return "Descartado. Solo la administración puede reactivarlo.";
    case "otro":
      return `Vuelve a salir a partir del ${sumarDias(f.creado_en, 30)}.`;
    default:
      return "";
  }
}

export default function BitacoraLlamadasPage() {
  const { vendedor, esAdmin, esAdminUnidad, cargando } = useVendedorActual();
  const veTodos = esAdmin || esAdminUnidad;

  const hoy = new Date();
  const haceSemana = new Date();
  haceSemana.setDate(hoy.getDate() - 6);
  const [desde, setDesde] = useState(aTexto(haceSemana));
  const [hasta, setHasta] = useState(aTexto(hoy));
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroResultado, setFiltroResultado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloConComentario, setSoloConComentario] = useState(false);

  const [llamadas, setLlamadas] = useState<FilaBitacora[] | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(100);

  useEffect(() => {
    if (veTodos) listarVendedores().then(setVendedores).catch(() => setVendedores([]));
  }, [veTodos]);

  useEffect(() => {
    if (!desde || !hasta) return;
    let vigente = true;
    const inicio = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T00:00:00`);
    fin.setDate(fin.getDate() + 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLlamadas(null);
    setError(null);
    setMostrar(100);
    listarBitacoraLlamadas(inicio.toISOString(), fin.toISOString())
      .then((l) => vigente && setLlamadas(l))
      .catch((e) => {
        if (!vigente) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar");
        setLlamadas([]);
      });
    return () => {
      vigente = false;
    };
  }, [desde, hasta]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (llamadas ?? []).filter((f) => {
      if (filtroVendedor && f.vendedor_id !== filtroVendedor) return false;
      if (filtroResultado && f.resultado !== filtroResultado) return false;
      if (soloConComentario && !(f.nota ?? "").trim()) return false;
      if (q && !`${f.cliente?.empresa ?? ""} ${f.nota ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [llamadas, filtroVendedor, filtroResultado, busqueda, soloConComentario]);

  async function exportar() {
    await descargarExcel(
      `bitacora_llamadas_${desde}_a_${hasta}.xlsx`,
      ["Fecha", "Hora", "Vendedor", "Cliente", "Resultado", "Detalle", "Comentario", "Qué pasa después", "Generó oportunidad"],
      visibles.map((f) => {
        const d = new Date(f.creado_en);
        return [
          d.toLocaleDateString("es-MX"),
          d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
          f.vendedor?.nombre ?? "",
          f.cliente?.empresa ?? "",
          RESULTADO_LLAMADA[f.resultado]?.label ?? f.resultado,
          detalleExtra(f),
          f.nota ?? "",
          queSigue(f),
          f.oportunidad_id ? "Sí" : "",
        ];
      }),
      "Llamadas"
    );
  }

  if (cargando) return <main className="max-w-5xl mx-auto p-6 text-sm text-ink-muted">Cargando...</main>;

  const campo = "border border-line bg-card text-ink rounded-md px-3 py-2 text-sm";

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-5">
      <PageHeader
        titulo="Bitácora de llamadas"
        descripcion={
          veTodos
            ? "Todas las llamadas de cartera que registraron los vendedores, con su comentario."
            : "Tus llamadas de cartera con el comentario que dejaste."
        }
        accion={
          <button onClick={exportar} disabled={!visibles.length} className="text-sm px-4 py-2 rounded-md border border-line bg-card text-ink disabled:opacity-50">
            Exportar a Excel
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-muted">
          <span className="block mb-1">Desde</span>
          <input type="date" className={campo} value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-xs text-ink-muted">
          <span className="block mb-1">Hasta</span>
          <input type="date" className={campo} value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {veTodos && (
          <label className="text-xs text-ink-muted">
            <span className="block mb-1">Vendedor</span>
            <select className={campo} value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)}>
              <option value="">Todos</option>
              {vendedores
                .filter((v) => (v.meta_llamadas_diarias ?? 0) > 0 || v.id === vendedor?.id)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="text-xs text-ink-muted">
          <span className="block mb-1">Resultado</span>
          <select className={campo} value={filtroResultado} onChange={(e) => setFiltroResultado(e.target.value as ResultadoLlamada | "")}>
            <option value="">Todos</option>
            {(Object.keys(RESULTADO_LLAMADA) as ResultadoLlamada[]).map((r) => (
              <option key={r} value={r}>
                {RESULTADO_LLAMADA[r].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-muted flex-1 min-w-[12rem]">
          <span className="block mb-1">Buscar cliente o comentario</span>
          <input className={`${campo} w-full`} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. Garma, cotización, Buen Fin" />
        </label>
        <label className="text-sm text-ink flex items-center gap-2 pb-2">
          <input type="checkbox" checked={soloConComentario} onChange={(e) => setSoloConComentario(e.target.checked)} />
          Solo con comentario
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-sm text-ink-muted">
        {llamadas === null ? "Cargando..." : `${visibles.length} llamada${visibles.length === 1 ? "" : "s"}`}
      </p>

      <div className="rounded-lg border border-line bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-section text-ink-muted text-left">
            <tr>
              <th className="p-3">Fecha</th>
              {veTodos && <th className="p-3">Vendedor</th>}
              <th className="p-3">Cliente</th>
              <th className="p-3">Resultado</th>
              <th className="p-3">Comentario</th>
              <th className="p-3">Qué pasa después</th>
            </tr>
          </thead>
          <tbody>
            {llamadas !== null && visibles.length === 0 ? (
              <tr>
                <td className="p-3 text-ink-muted" colSpan={veTodos ? 6 : 5}>
                  No hay llamadas con estos filtros.
                </td>
              </tr>
            ) : (
              visibles.slice(0, mostrar).map((f) => (
                <tr key={f.id} className="border-t align-top">
                  <td className="p-3 font-num whitespace-nowrap">{fechaHora(f.creado_en)}</td>
                  {veTodos && <td className="p-3 whitespace-nowrap">{f.vendedor?.nombre ?? "—"}</td>}
                  <td className="p-3">
                    {f.cliente ? (
                      <Link href={`/clientes/${f.cliente.id}`} className="font-medium text-ink underline">
                        {f.cliente.empresa}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    {RESULTADO_LLAMADA[f.resultado]?.label ?? f.resultado}
                    {detalleExtra(f) && <span className="block text-xs text-ink-muted">{detalleExtra(f)}</span>}
                    {f.oportunidad_id && (
                      <Link href={`/oportunidades/${f.oportunidad_id}`} className="block text-xs text-green-700 underline">
                        Generó una oportunidad
                      </Link>
                    )}
                  </td>
                  <td className="p-3 text-ink max-w-md">{f.nota || <span className="text-ink-muted">Sin comentario</span>}</td>
                  <td className="p-3 text-ink-muted max-w-xs">{queSigue(f)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {visibles.length > mostrar && (
        <button onClick={() => setMostrar((m) => m + 100)} className="text-sm px-4 py-2 rounded-md border border-line bg-card">
          Mostrar más ({visibles.length - mostrar} restantes)
        </button>
      )}
    </main>
  );
}
