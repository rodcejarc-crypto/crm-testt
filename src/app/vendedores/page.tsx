"use client";

import { useEffect, useState } from "react";
import { actualizarHaceVisitasCampo, actualizarMetaLlamadas, listarVendedores } from "@/lib/data/vendedores";
import { crearVendedorConAcceso } from "./actions";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { UNIDADES_NEGOCIO, unidadDe } from "@/lib/unidades";
import { PausarLlamadasModal } from "@/components/PausarLlamadasModal";
import {
  cancelarPausaLlamadas,
  contarLlamadasPendientes,
  estadoPausa,
  formatoFecha,
  listarPausas,
  pausasActivasPorVendedor,
  type EstadoPausa,
  type PausaLlamadas,
} from "@/lib/data/pausas";
import type { Vendedor } from "@/lib/types";

const ETIQUETA_ESTADO: Record<EstadoPausa, string> = {
  programada: "Programada",
  activa: "En pausa",
  terminada: "Terminada",
  cancelada: "Cancelada",
};
const COLOR_ESTADO: Record<EstadoPausa, string> = {
  programada: "bg-blue-100 text-blue-800",
  activa: "bg-amber-100 text-amber-800",
  terminada: "bg-section text-ink-muted",
  cancelada: "bg-red-100 text-red-700",
};

export default function VendedoresPage() {
  const { esAdmin, esAdminUnidad, miUnidad, cargando: cargandoRol } = useVendedorActual();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState<"vendedor" | "admin_unidad">("vendedor");
  const [unidadNueva, setUnidadNueva] = useState<string>(UNIDADES_NEGOCIO[0]);
  const [cargando, setCargando] = useState(true);
  const [pausas, setPausas] = useState<PausaLlamadas[]>([]);
  const [pausando, setPausando] = useState<Vendedor | null>(null);
  const [pausandoTodos, setPausandoTodos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordGenerada, setPasswordGenerada] = useState<{
    email: string;
    password: string;
  } | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const [v, p] = await Promise.all([listarVendedores(), listarPausas().catch(() => [])]);
      setVendedores(v);
      setPausas(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, []);

  async function onCambiarVisitas(id: string, valor: boolean) {
    setError(null);
    try {
      await actualizarHaceVisitasCampo(id, valor);
      setVendedores((prev) => prev.map((v) => (v.id === id ? { ...v, hace_visitas_campo: valor } : v)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function onCancelarPausa(id: string) {
    if (!window.confirm("¿Cancelar esta pausa? El vendedor volverá a recibir llamadas desde la siguiente carga (6:00 a.m.).")) return;
    setError(null);
    try {
      await cancelarPausaLlamadas(id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar la pausa");
    }
  }

  async function onCambiarMetaLlamadas(id: string, texto: string, campo?: HTMLInputElement) {
    setError(null);
    const n = texto.trim() === "" ? null : Math.max(0, Math.min(50, Math.floor(Number(texto))));
    if (n !== null && Number.isNaN(n)) return;
    const valor = n === 0 ? null : n;
    const anterior = vendedores.find((v) => v.id === id)?.meta_llamadas_diarias ?? null;
    try {
      // Dejarlo vacío solo frena las cargas nuevas: se avisa cuántas llamadas pendientes se mantienen.
      if (valor === null && anterior !== null) {
        const pendientes = await contarLlamadasPendientes(id);
        const quien = vendedores.find((v) => v.id === id)?.nombre ?? "El vendedor";
        const ok = window.confirm(
          `${quien} tiene ${pendientes} llamadas pendientes.\n\nAl dejar "Llamadas al día" vacío ya no se le cargarán llamadas nuevas, pero esas ${pendientes} se mantienen y las puede seguir gestionando.\n\n¿Guardar?`
        );
        if (!ok) {
          if (campo) campo.value = String(anterior);
          return;
        }
      }
      await actualizarMetaLlamadas(id, valor);
      setVendedores((prev) => prev.map((v) => (v.id === id ? { ...v, meta_llamadas_diarias: valor } : v)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) return;
    setGuardando(true);
    setError(null);
    setPasswordGenerada(null);
    try {
      const { password } = await crearVendedorConAcceso(
        nombre.trim(),
        email.trim(),
        tipoCuenta,
        tipoCuenta === "admin_unidad" ? unidadNueva : undefined
      );
      setPasswordGenerada({ email: email.trim(), password });
      setNombre("");
      setEmail("");
      setTipoCuenta("vendedor");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoRol) {
    return <main className="max-w-2xl mx-auto p-6">Cargando...</main>;
  }

  if (!esAdmin && !esAdminUnidad) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Esta sección es solo para administradores. Si necesitas dar de alta
          a un vendedor, pídeselo a tu administrador.
        </div>
      </main>
    );
  }

  // Un administrador de unidad ve solo el equipo de su propia unidad; los
  // nombres no son un dato privado (RLS ya limita todo lo que sí importa),
  // pero esta lista es justamente "mi equipo", así que se filtra.
  const vendedoresVisibles = esAdminUnidad
    ? vendedores.filter((v) => unidadDe(v.unidad_negocio) === miUnidad)
    : vendedores;
  const pausaActiva = pausasActivasPorVendedor(pausas);
  const idsVisibles = new Set(vendedoresVisibles.map((v) => v.id));
  const pausasVisibles = pausas.filter((p) => idsVisibles.has(p.vendedor_id));

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">
          Vendedores{esAdminUnidad ? ` — ${miUnidad}` : ""}
        </h1>
        <p className="text-ink-muted text-sm">
          {esAdmin
            ? "Cada vendedor creado aquí recibe una cuenta para iniciar sesión en el CRM con su correo y una contraseña generada automáticamente."
            : `Equipo de tu unidad (${miUnidad}). Dar de alta cuentas nuevas lo hace la administración general.`}
        </p>
        {esAdmin && vendedores.some((v) => v.activo && (v.meta_llamadas_diarias ?? 0) > 0) && (
          <button
            onClick={() => setPausandoTodos(true)}
            className="mt-3 text-sm px-4 py-2 rounded-md border border-line bg-card text-ink"
          >
            Pausar a todos
          </button>
        )}
      </div>

      {esAdmin && (
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-line bg-card p-4 space-y-3"
        >
          <h2 className="font-semibold text-ink">Agregar vendedor</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              placeholder="Nombre completo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <input
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              placeholder="Correo (con el que iniciará sesión)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              value={tipoCuenta}
              onChange={(e) => setTipoCuenta(e.target.value as "vendedor" | "admin_unidad")}
            >
              <option value="vendedor">Vendedor</option>
              <option value="admin_unidad">Administrador de unidad</option>
            </select>
            {tipoCuenta === "admin_unidad" && (
              <select
                className="flex-1 border rounded-md px-3 py-2 text-sm"
                value={unidadNueva}
                onChange={(e) => setUnidadNueva(e.target.value)}
              >
                {UNIDADES_NEGOCIO.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={guardando || !nombre.trim() || !email.trim()}
              className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap"
            >
              {guardando ? "Creando..." : "Crear cuenta"}
            </button>
          </div>
          {tipoCuenta === "admin_unidad" && (
            <p className="text-xs text-ink-muted">
              Un administrador de unidad ve y opera el CRM igual que un administrador (dashboard,
              clientes, ventas, vendedores), pero limitado a esa unidad. No crea vendedores ni fija
              metas.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {passwordGenerada && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-green-900">
            ✅ Cuenta creada para {passwordGenerada.email}
          </p>
          <p className="text-sm text-green-800">
            Contraseña inicial:{" "}
            <code className="bg-card px-2 py-1 rounded border font-mono text-base">
              {passwordGenerada.password}
            </code>
          </p>
          <p className="text-xs text-green-700">
            Cópiala y compártela con el vendedor ahora — no se volverá a
            mostrar. Puede cambiarla después desde su cuenta.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-line bg-card divide-y">
        {cargando ? (
          <p className="p-4 text-sm text-ink-muted">Cargando...</p>
        ) : vendedoresVisibles.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">
            Todavía no hay vendedores registrados.
          </p>
        ) : (
          vendedoresVisibles.map((v) => (
            <div key={v.id} className="p-3 flex justify-between items-center text-sm">
              <div>
                <span className="font-medium text-ink">{v.nombre}</span>
                <span className="text-ink-muted ml-2">{v.email || "—"}</span>
                {v.rol === "admin" && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    Administrador
                  </span>
                )}
                {v.rol === "admin_unidad" && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    Admin de unidad
                  </span>
                )}
              </div>
              <label
                className="flex items-center gap-1.5 text-xs text-ink-muted mr-3 whitespace-nowrap"
                title="Cuántos clientes sin atención debe llamar cada día. Vacío = no participa."
              >
                Llamadas al día
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-14 border border-line bg-card text-ink rounded-md px-1.5 py-1 text-xs font-num"
                  defaultValue={v.meta_llamadas_diarias ?? ""}
                  disabled={!esAdmin}
                  onBlur={(e) => {
                    const actual = v.meta_llamadas_diarias ?? "";
                    if (e.target.value !== String(actual)) onCambiarMetaLlamadas(v.id, e.target.value, e.target);
                  }}
                />
              </label>
              {(v.meta_llamadas_diarias ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 mr-3 whitespace-nowrap">
                  {pausaActiva.get(v.id) ? (
                    <>
                      <span
                        className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800"
                        title={pausaActiva.get(v.id)!.motivo}
                      >
                        En pausa hasta {formatoFecha(pausaActiva.get(v.id)!.hasta)}
                      </span>
                      {esAdmin && (
                        <button
                          onClick={() => onCancelarPausa(pausaActiva.get(v.id)!.id)}
                          className="text-xs px-2 py-1 rounded-md border border-line bg-card text-ink"
                        >
                          Cancelar pausa
                        </button>
                      )}
                    </>
                  ) : (
                    esAdmin && (
                      <button
                        onClick={() => setPausando(v)}
                        className="text-xs px-2 py-1 rounded-md border border-line bg-card text-ink"
                      >
                        Pausar llamadas
                      </button>
                    )
                  )}
                </div>
              )}
              <label
                className="flex items-center gap-1.5 text-xs text-ink-muted mr-3 whitespace-nowrap"
                title={esAdmin ? "Solo la administración puede cambiarlo" : "Lo define la administración"}
              >
                <input
                  type="checkbox"
                  checked={v.hace_visitas_campo}
                  disabled={!esAdmin}
                  onChange={(e) => onCambiarVisitas(v.id, e.target.checked)}
                />
                Hace visitas de campo
              </label>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  v.auth_user_id
                    ? "bg-green-100 text-green-700"
                    : "bg-section text-ink-muted"
                }`}
              >
                {v.auth_user_id ? "Con acceso" : "Sin acceso"}
              </span>
            </div>
          ))
        )}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Historial de pausas de llamadas</h2>
        <div className="rounded-lg border border-line bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-section text-ink-muted text-left">
              <tr>
                <th className="p-3">Vendedor</th>
                <th className="p-3">Desde</th>
                <th className="p-3">Hasta</th>
                <th className="p-3">Motivo</th>
                <th className="p-3">Pendientes</th>
                <th className="p-3">La puso</th>
                <th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pausasVisibles.length === 0 ? (
                <tr>
                  <td className="p-3 text-ink-muted" colSpan={7}>
                    Todavía no hay pausas.
                  </td>
                </tr>
              ) : (
                pausasVisibles.map((p) => {
                  const estado = estadoPausa(p);
                  return (
                    <tr key={p.id} className="border-t align-top">
                      <td className="p-3 font-medium text-ink whitespace-nowrap">{p.vendedor?.nombre ?? "—"}</td>
                      <td className="p-3 font-num whitespace-nowrap">{formatoFecha(p.desde)}</td>
                      <td className="p-3 font-num whitespace-nowrap">{formatoFecha(p.hasta)}</td>
                      <td className="p-3 text-ink-muted">{p.motivo}</td>
                      <td className="p-3 text-xs text-ink-muted whitespace-nowrap">
                        {p.mantener_pendientes === false ? "Se ocultan" : "Se mantienen"}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {p.creador?.nombre ?? "—"}
                        <span className="block text-xs text-ink-muted">{new Date(p.creado_en).toLocaleDateString("es-MX")}</span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${COLOR_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>
                        {p.cancelada_en && (
                          <span className="block text-xs text-ink-muted">
                            {p.cancelador?.nombre ?? ""} · {new Date(p.cancelada_en).toLocaleDateString("es-MX")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {pausandoTodos && (
        <PausarLlamadasModal
          todosCantidad={vendedores.filter((v) => v.activo && (v.meta_llamadas_diarias ?? 0) > 0).length}
          onCancel={() => setPausandoTodos(false)}
          onHecho={async () => {
            setPausandoTodos(false);
            await cargar();
          }}
        />
      )}

      {pausando && (
        <PausarLlamadasModal
          vendedorId={pausando.id}
          nombre={pausando.nombre}
          meta={pausando.meta_llamadas_diarias ?? 0}
          onCancel={() => setPausando(null)}
          onHecho={async () => {
            setPausando(null);
            await cargar();
          }}
        />
      )}
    </main>
  );
}
