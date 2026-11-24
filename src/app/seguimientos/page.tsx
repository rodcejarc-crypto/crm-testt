"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { completarTarea, listarTareasHoyYAtrasadas, listarTareasProximas } from "@/lib/data/tareas";
import { comentariosSinLeer } from "@/lib/data/comentarios";
import { PageHeader } from "@/components/PageHeader";
import { RegistrarSeguimientoModal, type ExtrasRegistro } from "@/components/RegistrarSeguimientoModal";
import { EvaluacionMuestraModal } from "@/components/EvaluacionMuestraModal";
import { RegistrarLlamadaModal, type DatosLlamada } from "@/components/RegistrarLlamadaModal";
import { etiquetaOrigen } from "@/lib/origen-cliente";
import { formatoFecha, listarPausas, pausasActivasPorVendedor, type PausaLlamadas } from "@/lib/data/pausas";
import { avisosCarteraAgotada, contarLlamadasDeHoy, registrarLlamada, type AvisoCarteraAgotada } from "@/lib/data/llamadas";
import { pasarAEvaluacionFinal } from "@/lib/data/muestras";
import { diasEntre, hoyIso } from "@/lib/muestras";
import type { Muestra } from "@/lib/types";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Tarea, TipoTarea } from "@/lib/types";

const TIPO_INFO: Record<TipoTarea, { label: string; color: string }> = {
  seguimiento_venta: { label: "Ventas", color: "bg-blue-100 text-blue-800" },
  seguimiento_recuperacion: {
    label: "Recuperación",
    color: "bg-purple-100 text-purple-800",
  },
  seguimiento_licitacion: {
    label: "Licitación",
    color: "bg-orange-100 text-orange-800",
  },
  licitacion_entrega: {
    label: "Licitación — entrega",
    color: "bg-orange-100 text-orange-800",
  },
  checkin_cuenta_clave: {
    label: "Cuenta clave",
    color: "bg-green-100 text-green-800",
  },
  llamada_cartera: {
    label: "📞 Llamada de cartera",
    color: "bg-amber-100 text-amber-900",
  },
};

/** Las llamadas de cartera muestran el nombre actual del cliente (el título se guardó al cargar la lista y no se actualiza al corregir el nombre). */
function tituloTarea(t: Tarea): string {
  return t.tipo === "llamada_cartera" && t.cliente?.empresa ? `Llamar a ${t.cliente.empresa}` : t.titulo;
}

/** Clientes cuyo "nombre" es solo un número (error de la importación): hay que ponerles su nombre. */
const sinNombre = (t: Tarea) => t.tipo === "llamada_cartera" && /^[d.s]*$/.test((t.cliente?.empresa ?? "").trim());

function datosTarjeta(t: Tarea) {
  if (t.cliente) {
    return { empresa: t.cliente.empresa, href: `/clientes/${t.cliente.id}` };
  }
  if (t.oportunidad) {
    return {
      empresa: t.oportunidad.cliente?.empresa || "Cliente",
      href: `/oportunidades/${t.oportunidad.id}`,
    };
  }
  return { empresa: "—", href: null as string | null };
}

function formatoHora(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

const LIMITE_PROXIMAS = 60;
const LIMITE_INICIAL = 40;

function diasAtraso(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha + "T00:00:00");
  return Math.round((hoy.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
}

export default function SeguimientosPage() {
  const { vendedor, esAdmin, esAdminUnidad, miUnidad } = useVendedorActual();
  // Solo cambia el texto y si se muestra el nombre del dueño de cada
  // tarea: la lista en sí ya viene limitada por RLS (todo el equipo para un
  // admin, solo la unidad para un admin de unidad, solo lo propio si no).
  const vistaDeEquipo = esAdmin || esAdminUnidad;
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [proximas, setProximas] = useState<Tarea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tareaSeleccionada, setTareaSeleccionada] = useState<Tarea | null>(null);
  // Oportunidades con comentarios de gerencia que el vendedor aún no lee.
  const [conComentario, setConComentario] = useState<Set<string>>(new Set());
  // Avance de la meta diaria de llamadas (solo quien está en el programa).
  const [llamadasHechas, setLlamadasHechas] = useState(0);
  const [carteraAgotada, setCarteraAgotada] = useState<AvisoCarteraAgotada[]>([]);
  const [pausas, setPausas] = useState<PausaLlamadas[]>([]);
  const [avisoOportunidad, setAvisoOportunidad] = useState<{ id: string; clienteId: string | null } | null>(null);
  const metaLlamadas = vendedor?.meta_llamadas_diarias ?? 0;
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "llamadas" | "seguimientos">("todos");

  async function cargar() {
    setCargando(true);
    try {
      const [t, p, sl] = await Promise.all([
        listarTareasHoyYAtrasadas(),
        listarTareasProximas(14),
        comentariosSinLeer().catch(() => []),
      ]);
      setTareas(t);
      setProximas(p);
      setConComentario(new Set(sl.map((c) => c.oportunidad_id)));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  useEffect(() => {
    if (!vendedor?.id || !vendedor.meta_llamadas_diarias) return;
    contarLlamadasDeHoy(vendedor.id)
      .then(setLlamadasHechas)
      .catch(() => {});
  }, [vendedor?.id, vendedor?.meta_llamadas_diarias, tareas]);

  useEffect(() => {
    listarPausas()
      .then(setPausas)
      .catch(() => setPausas([]));
  }, []);

  useEffect(() => {
    if (!vistaDeEquipo) return;
    const p = (n: number) => String(n).padStart(2, "0");
    const d = new Date();
    avisosCarteraAgotada(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
      .then(setCarteraAgotada)
      .catch(() => setCarteraAgotada([]));
  }, [vistaDeEquipo]);

  async function onConfirmarLlamada(datos: DatosLlamada) {
    if (!tareaSeleccionada) return;
    const clienteId = tareaSeleccionada.cliente?.id;
    const oportunidadNueva = await registrarLlamada({ tareaId: tareaSeleccionada.id, ...datos });
    setTareaSeleccionada(null);
    await cargar();
    if (oportunidadNueva) {
      setAvisoOportunidad({ id: oportunidadNueva, clienteId: clienteId ?? null });
    }
  }

  async function onConfirmarSeguimiento(
    nota: string,
    proximaFecha: string | null,
    proximaHora: string | null,
    extras: ExtrasRegistro
  ) {
    if (!tareaSeleccionada) return;
    await completarTarea(tareaSeleccionada.id, {
      nota,
      proximaFecha: proximaFecha || undefined,
      proximaHora: proximaHora || undefined,
      resultadoPrueba: extras.resultadoPrueba,
    });
    // El cliente rechazó la prueba: se salta directo a la evaluación final.
    if (extras.pasarAEvaluacionFinal && tareaSeleccionada.muestra_id) {
      await pasarAEvaluacionFinal(tareaSeleccionada.muestra_id, "El cliente rechazó la muestra durante la prueba");
    }
    setTareaSeleccionada(null);
    await cargar();
  }

  // Filtros de la vista de equipo: por vendedor y por tipo de pendiente.
  const todas = [...tareas, ...proximas];
  const esLlamada = (t: Tarea) => t.tipo === "llamada_cartera";
  const deVendedor = (t: Tarea) => !filtroVendedor || t.dueno_comercial_id === filtroVendedor;
  const deTipo = (t: Tarea) =>
    filtroTipo === "todos" || (filtroTipo === "llamadas" ? esLlamada(t) : !esLlamada(t));
  const tareasVista = tareas.filter((t) => deVendedor(t) && deTipo(t));
  const proximasVista = proximas.filter((t) => deVendedor(t) && deTipo(t));
  const atrasadas = tareasVista.filter((t) => diasAtraso(t.fecha_vencimiento) > 0);
  const hoy = tareasVista.filter((t) => diasAtraso(t.fecha_vencimiento) === 0);

  const llamadasAtrasadasPropias = (() => {
    const atrasos = tareas
      .filter((t) => esLlamada(t) && t.dueno_comercial_id === vendedor?.id)
      .map((t) => diasAtraso(t.fecha_vencimiento))
      .filter((d) => d > 0);
    return { total: atrasos.length, dias: atrasos.length ? Math.max(...atrasos) : 0 };
  })();

  const conteoTipo = {
    todos: todas.filter(deVendedor).length,
    llamadas: todas.filter((t) => deVendedor(t) && esLlamada(t)).length,
    seguimientos: todas.filter((t) => deVendedor(t) && !esLlamada(t)).length,
  };

  const pausaActiva = pausasActivasPorVendedor(pausas);
  const miPausa = vendedor?.id ? pausaActiva.get(vendedor.id) : undefined;

  // Resumen por vendedor (clic para filtrar).
  const resumenVendedores = (() => {
    const m = new Map<
      string,
      {
        id: string;
        nombre: string;
        segAtrasados: number;
        segHoy: number;
        llamHoy: number;
        llamAtrasadas: number;
        llamDias: number;
        pausaHasta: string | null;
      }
    >();
    for (const t of tareas) {
      if (!t.dueno_comercial_id) continue;
      let f = m.get(t.dueno_comercial_id);
      if (!f) {
        f = {
          id: t.dueno_comercial_id,
          nombre: t.dueno?.nombre ?? "—",
          segAtrasados: 0,
          segHoy: 0,
          llamHoy: 0,
          llamAtrasadas: 0,
          llamDias: 0,
          pausaHasta: null,
        };
        m.set(t.dueno_comercial_id, f);
      }
      if (esLlamada(t)) {
        const atraso = diasAtraso(t.fecha_vencimiento);
        if (atraso > 0) {
          f.llamAtrasadas++;
          f.llamDias = Math.max(f.llamDias, atraso);
        } else f.llamHoy++;
      } else if (diasAtraso(t.fecha_vencimiento) > 0) f.segAtrasados++;
      else f.segHoy++;
    }
    // Quien está en pausa aparece aunque hoy no tenga pendientes.
    for (const [id, p] of pausaActiva) {
      const f = m.get(id) ?? {
        id,
        nombre: p.vendedor?.nombre ?? "—",
        segAtrasados: 0,
        segHoy: 0,
        llamHoy: 0,
        llamAtrasadas: 0,
        llamDias: 0,
        pausaHasta: null,
      };
      f.pausaHasta = p.hasta;
      m.set(id, f);
    }
    return [...m.values()].sort((a, b) => b.segAtrasados - a.segAtrasados || a.nombre.localeCompare(b.nombre));
  })();

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <PageHeader
        titulo="Seguimientos"
        descripcion={
          vistaDeEquipo
            ? `De hoy, atrasados y próximos${esAdminUnidad ? ` de tu unidad (${miUnidad})` : " de todo el equipo"}, en los 3 pipelines.`
            : "Tus seguimientos, fechas límite y check-ins de hoy, atrasados y próximos."
        }
      />

      {miPausa && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⏸️ <strong>No se te cargan llamadas nuevas hasta el {formatoFecha(miPausa.hasta)}</strong> ({miPausa.motivo}).{" "}
          {miPausa.mantener_pendientes === false
            ? "Tus llamadas pendientes quedan ocultas durante la pausa."
            : "Las que ya tienes pendientes siguen aquí para que las gestiones."}{" "}
          Vuelves a recibir tus {metaLlamadas} llamadas al día a partir del día siguiente.
        </div>
      )}

      {metaLlamadas > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            📞 Llamadas de hoy: <strong className="font-num">{llamadasHechas}</strong> de{" "}
            <strong className="font-num">{metaLlamadas}</strong>
          </span>
          <span className="text-xs">
            {llamadasHechas >= metaLlamadas
              ? "¡Meta del día cumplida! 🎉"
              : miPausa
                ? "Estás en pausa de cargas nuevas."
                : "Cada mañana a las 6:00 el CRM te entrega 10 clientes nuevos a llamar, los más importantes primero."}
          </span>
          {!vistaDeEquipo && llamadasAtrasadasPropias.total > 0 && (
            <span className="w-full text-xs font-semibold text-red-700">
              Tienes {llamadasAtrasadasPropias.total} llamadas atrasadas (la más antigua, de hace{" "}
              {llamadasAtrasadasPropias.dias} días). Se acumulan con las nuevas: ponte al corriente.
            </span>
          )}
        </div>
      )}

      {vistaDeEquipo &&
        carteraAgotada.map((a) => (
          <div key={a.vendedorId} className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            ⚠️ Cartera de llamadas agotada para <strong>{a.nombre}</strong>: hoy faltaron{" "}
            <strong className="font-num">{a.faltaron}</strong> clientes para completar sus nuevas llamadas.
          </div>
        ))}

      {avisoOportunidad && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 flex flex-wrap items-center justify-between gap-2">
          <span>✅ Se creó una oportunidad de Ventas para ese cliente.</span>
          <Link href={`/oportunidades/${avisoOportunidad.id}`} className="underline text-green-900">
            Abrir oportunidad
          </Link>
        </div>
      )}

      {vistaDeEquipo && !cargando && resumenVendedores.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-section text-ink-muted text-left">
                <tr>
                  <th className="p-3">Vendedor (clic para ver solo sus pendientes)</th>
                  <th className="p-3">Seguimientos atrasados</th>
                  <th className="p-3">Seguimientos de hoy</th>
                  <th className="p-3">📞 Llamadas de hoy</th>
                  <th className="p-3">📞 Llamadas atrasadas</th>
                  <th className="p-3">Más antigua (días)</th>
                </tr>
              </thead>
              <tbody>
                {resumenVendedores.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setFiltroVendedor(filtroVendedor === f.id ? "" : f.id)}
                    className={`border-t cursor-pointer hover:bg-section ${filtroVendedor === f.id ? "bg-amber-50" : ""}`}
                  >
                    <td className="p-3 font-medium text-ink">
                      {f.nombre}
                      {f.pausaHasta && (
                        <span className="block text-xs font-normal text-amber-800">
                          ⏸️ Sin cargas nuevas hasta {formatoFecha(f.pausaHasta)}
                        </span>
                      )}
                    </td>
                    <td className={`p-3 font-num ${f.segAtrasados > 0 ? "text-red-700 font-semibold" : ""}`}>{f.segAtrasados}</td>
                    <td className="p-3 font-num">{f.segHoy}</td>
                    <td className="p-3 font-num">{f.llamHoy}</td>
                    <td className={`p-3 font-num ${f.llamAtrasadas > 0 ? "text-red-700 font-semibold" : ""}`}>{f.llamAtrasadas}</td>
                    <td className={`p-3 font-num ${f.llamDias > 0 ? "text-red-700" : ""}`}>{f.llamDias > 0 ? f.llamDias : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              className="border border-line bg-card text-ink rounded-md px-3 py-2 text-sm"
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
            >
              <option value="">Todos los vendedores</option>
              {resumenVendedores
                .slice()
                .sort((a, b) => a.nombre.localeCompare(b.nombre))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
            </select>
            {(
              [
                ["todos", `Todos (${conteoTipo.todos})`],
                ["llamadas", `📞 Llamadas de cartera (${conteoTipo.llamadas})`],
                ["seguimientos", `Seguimientos de oportunidades (${conteoTipo.seguimientos})`],
              ] as const
            ).map(([k, etiqueta]) => (
              <button
                key={k}
                onClick={() => setFiltroTipo(k)}
                className={`text-sm px-3 py-1.5 rounded-full border ${
                  filtroTipo === k ? "bg-brand text-white border-brand" : "bg-card text-ink border-line"
                }`}
              >
                {etiqueta}
              </button>
            ))}
            {(filtroVendedor || filtroTipo !== "todos") && (
              <button
                onClick={() => {
                  setFiltroVendedor("");
                  setFiltroTipo("todos");
                }}
                className="text-sm text-brand underline"
              >
                Quitar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando...</p>
      ) : tareasVista.length === 0 && proximasVista.length === 0 ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-6 text-center">
          <p className="text-2xl mb-1">🎉</p>
          <p className="text-sm text-green-800">
            {filtroVendedor || filtroTipo !== "todos"
              ? "Con estos filtros no hay pendientes."
              : "No hay seguimientos pendientes ni próximos."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {atrasadas.length > 0 && (
            <Seccion
              titulo={`Atrasados (${atrasadas.length})`}
              colorTitulo="text-red-700"
              tareas={atrasadas}
              esAdmin={vistaDeEquipo}
              onRegistrar={setTareaSeleccionada}
              conComentario={conComentario}
            />
          )}
          {hoy.length > 0 && (
            <Seccion
              titulo={`Hoy (${hoy.length})`}
              colorTitulo="text-ink"
              tareas={hoy}
              esAdmin={vistaDeEquipo}
              onRegistrar={setTareaSeleccionada}
              conComentario={conComentario}
            />
          )}
          {tareasVista.length === 0 && proximasVista.length > 0 && (
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              🎉 No hay nada pendiente por hoy — pero ya tienes seguimientos programados más
              adelante (abajo).
            </div>
          )}
          {proximasVista.length > 0 && (
            <>
              <Seccion
                titulo={`Próximos 14 días (${proximasVista.length})`}
                colorTitulo="text-blue-700"
                tareas={proximasVista.slice(0, LIMITE_PROXIMAS)}
                esAdmin={vistaDeEquipo}
                onRegistrar={setTareaSeleccionada}
                conComentario={conComentario}
                mostrarFecha
              />
              {proximasVista.length > LIMITE_PROXIMAS && (
                <p className="text-xs text-ink-muted">
                  Mostrando los primeros {LIMITE_PROXIMAS} de {proximasVista.length}. Hay muchos porque
                  varias cuentas de Recuperación de Cartera arrancaron su calendario el mismo día —
                  se irán repartiendo solos en los próximos días.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tareaSeleccionada && tareaSeleccionada.tipo === "llamada_cartera" ? (
        <RegistrarLlamadaModal
          clienteId={tareaSeleccionada.cliente?.id ?? null}
          empresa={datosTarjeta(tareaSeleccionada).empresa}
          contacto={tareaSeleccionada.cliente?.contacto}
          telefono={tareaSeleccionada.cliente?.telefono}
          email={tareaSeleccionada.cliente?.email}
          observaciones={tareaSeleccionada.cliente?.observaciones}
          origen={tareaSeleccionada.cliente?.origen}
          onCancel={() => setTareaSeleccionada(null)}
          onConfirm={onConfirmarLlamada}
        />
      ) : tareaSeleccionada && tareaSeleccionada.muestra_rol === "final" && tareaSeleccionada.muestra_id ? (
        <EvaluacionMuestraModal
          muestra={
            {
              id: tareaSeleccionada.muestra_id,
              cliente: { id: tareaSeleccionada.oportunidad?.cliente?.id ?? "", empresa: datosTarjeta(tareaSeleccionada).empresa },
            } as Muestra
          }
          onClose={() => setTareaSeleccionada(null)}
          onHecho={() => {
            setTareaSeleccionada(null);
            cargar();
          }}
        />
      ) : (
        tareaSeleccionada && (
          <RegistrarSeguimientoModal
            titulo={tareaSeleccionada.titulo}
            empresa={datosTarjeta(tareaSeleccionada).empresa}
            detalle={tareaSeleccionada.detalle}
            muestra={
              tareaSeleccionada.muestra_id && tareaSeleccionada.oportunidad
                ? {
                    clienteId: tareaSeleccionada.oportunidad.cliente?.id ?? null,
                    clienteEmpresa: datosTarjeta(tareaSeleccionada).empresa,
                    oportunidadId: tareaSeleccionada.oportunidad.id,
                  }
                : null
            }
            onCancel={() => setTareaSeleccionada(null)}
            onConfirm={onConfirmarSeguimiento}
          />
        )
      )}
    </main>
  );
}

function Seccion({
  titulo,
  colorTitulo,
  tareas,
  esAdmin,
  onRegistrar,
  conComentario,
  mostrarFecha,
}: {
  titulo: string;
  colorTitulo: string;
  tareas: Tarea[];
  esAdmin: boolean;
  onRegistrar: (t: Tarea) => void;
  conComentario: Set<string>;
  mostrarFecha?: boolean;
}) {
  const [limite, setLimite] = useState(LIMITE_INICIAL);
  return (
    <div>
      <h2
        className={`font-display text-xs font-semibold uppercase tracking-wide mb-2 ${colorTitulo}`}
      >
        {titulo}
      </h2>
      <div className="rounded-lg border border-line bg-card divide-y divide-line">
        {tareas.slice(0, limite).map((t) => {
          const { empresa, href } = datosTarjeta(t);
          const atraso = diasAtraso(t.fecha_vencimiento);
          const info = TIPO_INFO[t.tipo];
          return (
            <div key={t.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${info.color}`}>
                    {info.label}
                  </span>
                  {atraso > 0 && (
                    <span className="font-num text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      {atraso} {atraso === 1 ? "día" : "días"} de atraso
                    </span>
                  )}
                  {mostrarFecha && (
                    <span className="font-num text-xs px-2 py-0.5 rounded-full bg-section text-ink-muted">
                      {new Date(t.fecha_vencimiento + "T00:00:00").toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                      })}
                      {t.hora_vencimiento ? ` · ${formatoHora(t.hora_vencimiento)}` : ""}
                    </span>
                  )}
                  {esAdmin && t.dueno && (
                    <span className="text-xs text-ink-muted">{t.dueno.nombre}</span>
                  )}
                  {t.muestra_id && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300">
                      🧪 Muestra
                      {t.muestra?.fecha_fin_prueba &&
                        (() => {
                          const d = diasEntre(hoyIso(), t.muestra.fecha_fin_prueba);
                          return d >= 0 ? ` · faltan ${d} día(s)` : ` · prueba terminada hace ${-d} día(s)`;
                        })()}
                    </span>
                  )}
                  {t.oportunidad_id && conComentario.has(t.oportunidad_id) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300">
                      💬 Comentario de gerencia
                    </span>
                  )}
                </div>
                <p className="font-body font-semibold text-ink mt-1">{tituloTarea(t)}</p>
                {t.detalle && <p className="text-xs text-ink-muted">Por validar: {t.detalle}</p>}
                {href ? (
                  <Link href={href} className="text-sm text-brand underline">
                    {empresa}
                  </Link>
                ) : (
                  <p className="text-sm text-ink-muted">{empresa}</p>
                )}
                {sinNombre(t) && (
                  <p className="text-xs text-red-700">
                    ⚠️ Este cliente no tiene nombre registrado{t.cliente?.ciudad ? ` (${t.cliente.ciudad})` : ""}. Al llamar, pregúntalo y escríbelo en su ficha.
                  </p>
                )}
                {t.tipo === "llamada_cartera" && etiquetaOrigen(t.cliente?.origen) && (
                  <p className="text-xs inline-block px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300">
                    {etiquetaOrigen(t.cliente?.origen)}
                  </p>
                )}
                {t.tipo === "llamada_cartera" && (
                  <p className="text-xs text-ink-muted font-num">
                    {[t.cliente?.telefono, t.cliente?.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </p>
                )}
              </div>
              <button
                onClick={() => onRegistrar(t)}
                className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-brand text-white whitespace-nowrap"
              >
                {t.tipo === "llamada_cartera" ? "Registrar llamada" : "Registrar seguimiento"}
              </button>
            </div>
          );
        })}
      </div>
      {tareas.length > limite && (
        <button
          onClick={() => setLimite((l) => l + LIMITE_INICIAL)}
          className="mt-2 text-sm text-brand underline"
        >
          Mostrar {Math.min(LIMITE_INICIAL, tareas.length - limite)} más (faltan {tareas.length - limite})
        </button>
      )}
    </div>
  );
}
