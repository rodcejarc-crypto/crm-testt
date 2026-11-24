"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buscarClientes, buscarClientesGlobal, contarClientes, exportarClientes } from "@/lib/data/clientes";
import { listarVendedores } from "@/lib/data/vendedores";
import { descargarExcel } from "@/lib/excel";
import { etiquetaMotivo, MOTIVOS_NO_APTO } from "@/lib/data/llamadas";
import { PageHeader } from "@/components/PageHeader";
import { colorDeVendedor } from "@/lib/vendorColors";
import { UNIDADES_NEGOCIO, unidadDe, type UnidadNegocio } from "@/lib/unidades";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { ClienteBusquedaGlobal, Vendedor } from "@/lib/types";

export default function ClientesPage() {
  const { vendedor, esAdmin, esAdminUnidad, miUnidad, cargando: cargandoRol } = useVendedorActual();
  // Un administrador de unidad tiene la misma vista de "admin" (buscador
  // global, exportar, filtros), pero atada a su propia unidad — no elige,
  // ya está fija (ver `unidadEfectiva` abajo).
  const puedeVerTodo = esAdmin || esAdminUnidad;
  const [texto, setTexto] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [unidadFiltro, setUnidadFiltro] = useState<UnidadNegocio | "">("");
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [resultados, setResultados] = useState<ClienteBusquedaGlobal[]>([]);
  const [avisoOtros, setAvisoOtros] = useState<{ empresa: string; dueno_nombre: string | null }[]>(
    []
  );
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  // Estado del cliente: Activos (por defecto), Descartados o Todos; y, si son descartados, su motivo.
  const [estadoFiltro, setEstadoFiltro] = useState<"activos" | "descartados" | "todos">("activos");
  const [motivoFiltro, setMotivoFiltro] = useState("");
  const incluirDescartados = estadoFiltro === "todos";
  const soloDescartados = estadoFiltro === "descartados";
  const motivoDescarte = soloDescartados ? motivoFiltro || undefined : undefined;

  useEffect(() => {
    if (puedeVerTodo) listarVendedores().then(setVendedores).catch(() => {});
  }, [puedeVerTodo]);

  // Un administrador de unidad no elige unidad: siempre es la suya.
  const unidadEfectiva = esAdminUnidad ? miUnidad ?? "" : unidadFiltro;

  // Vendedores que pertenecen a la unidad elegida (todos, si no hay filtro).
  const vendedoresFiltrados = unidadEfectiva
    ? vendedores.filter((v) => unidadDe(v.unidad_negocio) === unidadEfectiva)
    : vendedores;
  const idsUnidad =
    unidadEfectiva && !vendedorId ? vendedoresFiltrados.map((v) => v.id) : undefined;

  // El contador de arriba es independiente del buscador de texto: siempre
  // dice cuántos clientes tiene visibles esta cuenta (o el filtro de
  // vendedor/unidad, si eres admin), no cuántos aparecen en una búsqueda puntual.
  useEffect(() => {
    if (cargandoRol) return;
    contarClientes({
      vendedorId: puedeVerTodo ? vendedorId || undefined : undefined,
      vendedorIds: puedeVerTodo ? idsUnidad : undefined,
      incluirDescartados,
      soloDescartados,
      motivoDescarte,
    })
      .then(setTotal)
      .catch(() => setTotal(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVerTodo, vendedorId, unidadEfectiva, estadoFiltro, motivoFiltro, cargandoRol]);

  useEffect(() => {
    if (cargandoRol) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feedback visual inmediato al escribir en el buscador
    setCargando(true);
    const t = setTimeout(() => {
      // La búsqueda global solo cubre clientes activos; con descartados se usa el listado normal.
      const buscando = texto.trim().length > 0 && estadoFiltro === "activos";

      if (puedeVerTodo) {
        // Dirección Comercial (o el administrador de esta unidad) ve y
        // busca en toda la cartera visible para su cuenta. Para un admin de
        // unidad, la función buscar_clientes_global ya viene limitada a su
        // unidad desde la base de datos.
        const promesa = buscando
          ? buscarClientesGlobal(texto)
          : buscarClientes({
              texto: estadoFiltro !== "activos" ? texto || undefined : undefined,
              vendedorId: vendedorId || undefined,
              vendedorIds: idsUnidad,
              incluirDescartados,
              soloDescartados,
              motivoDescarte,
            }).then((cs) =>
              cs.map(
                (c): ClienteBusquedaGlobal => ({
                  id: c.id,
                  empresa: c.empresa,
                  ciudad: c.ciudad,
                  estado: c.estado,
                  rfc: c.rfc,
                  tipo_cliente: c.tipo_cliente,
                  nivel_cuenta: c.nivel_cuenta,
                  dueno_comercial_id: c.dueno_comercial_id,
                  dueno_nombre: c.dueno?.nombre ?? null,
                  descartado: c.descartado,
                })
              )
            );
        promesa
          .then((rs) => {
            if (!buscando) return rs;
            if (vendedorId) return rs.filter((r) => r.dueno_comercial_id === vendedorId);
            if (idsUnidad) {
              const set = new Set(idsUnidad);
              return rs.filter((r) => r.dueno_comercial_id && set.has(r.dueno_comercial_id));
            }
            return rs;
          })
          .then(setResultados)
          .catch(() => setResultados([]))
          .finally(() => setCargando(false));
        return;
      }

      // Un vendedor SOLO ve su propia cartera, aquí y al buscar. RLS ya
      // limita esta consulta a "los míos" sin importar lo que se escriba.
      const propios = buscarClientes({
        texto: texto || undefined,
        incluirDescartados,
        soloDescartados,
        motivoDescarte,
      }).then((cs) =>
        cs.map(
          (c): ClienteBusquedaGlobal => ({
            id: c.id,
            empresa: c.empresa,
            ciudad: c.ciudad,
            estado: c.estado,
            rfc: c.rfc,
            tipo_cliente: c.tipo_cliente,
            nivel_cuenta: c.nivel_cuenta,
            dueno_comercial_id: c.dueno_comercial_id,
            dueno_nombre: c.dueno?.nombre ?? null,
            descartado: c.descartado,
          })
        )
      );
      propios.then(setResultados).catch(() => setResultados([]));

      // Si escribió algo, solo avisa si ese nombre/RFC ya es cliente de
      // ALGUIEN MÁS — sin mostrar lista ni permitir abrirlo.
      const chequeoOtros =
        buscando && texto.trim().length >= 3
          ? buscarClientesGlobal(texto).then((rs) =>
              rs
                .filter((r) => r.dueno_comercial_id !== vendedor?.id)
                .slice(0, 5)
                .map((r) => ({ empresa: r.empresa, dueno_nombre: r.dueno_nombre }))
            )
          : Promise.resolve([]);
      chequeoOtros
        .then(setAvisoOtros)
        .catch(() => setAvisoOtros([]));

      Promise.all([propios, chequeoOtros]).finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, vendedorId, unidadEfectiva, puedeVerTodo, estadoFiltro, motivoFiltro, cargandoRol, vendedor?.id]);

  async function onExportar() {
    setExportando(true);
    try {
      // La exportación siempre usa el filtro de vendedor/unidad (no el
      // buscador de texto): RLS ya limita a "los míos" si no eres admin.
      const clientes = await exportarClientes({
        vendedorId: puedeVerTodo ? vendedorId || undefined : undefined,
        vendedorIds: puedeVerTodo ? idsUnidad : undefined,
        incluirDescartados,
        soloDescartados,
        motivoDescarte,
      });
      await descargarExcel(
        `clientes_rhinoboots_${new Date().toISOString().slice(0, 10)}.xlsx`,
        [
          "Empresa",
          "Contacto",
          "Teléfono",
          "Correo",
          "Redes sociales",
          "Dirección",
          "Ciudad",
          "Estado",
          "RFC",
          "Tipo de cliente",
          "Nivel de cuenta",
          "Cuenta clave",
          "Categoría",
          "Grupo",
          "Comisionista",
          "Vendedor",
          "Unidad de negocio",
          "Descartado",
          "Motivo de descarte",
          "Comentario del descarte",
        ],
        clientes.map((c) => [
          c.empresa,
          c.contacto,
          c.telefono,
          c.email,
          c.redes_sociales,
          c.direccion,
          c.ciudad,
          c.estado,
          c.rfc,
          c.tipo_cliente,
          c.nivel_cuenta,
          c.cuenta_clave,
          c.categoria_cliente ?? "",
          c.grupo?.nombre ?? "",
          c.comisionista ?? "",
          c.dueno?.nombre ?? "Sin asignar",
          unidadDe(c.dueno?.unidad_negocio) ?? c.dueno?.unidad_negocio ?? "",
          c.descartado ? "Sí" : "No",
          c.descartado ? etiquetaMotivo(c.motivo_descarte_tipo) : "",
          c.motivo_descarte ?? "",
        ])
      );
    } finally {
      setExportando(false);
    }
  }

  const nombreFiltro = puedeVerTodo
    ? vendedorId
      ? `de ${vendedores.find((v) => v.id === vendedorId)?.nombre || "este vendedor"}`
      : unidadEfectiva
        ? `de la unidad ${unidadEfectiva}`
        : "en total"
    : "en tu cartera";

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <PageHeader
        titulo="Clientes"
        descripcion={
          total === null ? "Contando..." : `${total.toLocaleString("es-MX")} cliente(s) ${nombreFiltro}`
        }
        accion={
          <>
            <button
              onClick={onExportar}
              disabled={exportando}
              className="text-sm px-4 py-2 rounded-md border border-line bg-card text-ink disabled:opacity-50"
            >
              {exportando ? "Exportando..." : "Exportar a Excel"}
            </button>
            {esAdmin && (
              // La carga masiva sigue siendo solo de la administración
              // general: reparte clientes entre TODA la empresa.
              <Link
                href="/clientes/importar"
                className="text-sm px-4 py-2 rounded-md border border-line bg-card text-ink"
              >
                Importar en lote
              </Link>
            )}
            <Link
              href="/clientes/nuevo"
              className="bg-brand text-white rounded-md px-4 py-2 text-sm"
            >
              + Nuevo cliente
            </Link>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 px-4 py-2 rounded-full border border-line bg-card text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
          placeholder={
            puedeVerTodo ? "Buscar por empresa, ciudad o RFC..." : "Buscar en tu cartera por nombre o RFC..."
          }
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {/* El filtro de unidad solo lo elige el admin general — un admin de
            unidad ya tiene la suya fija, no hay nada que elegir. */}
        {esAdmin && (
          <select
            className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink sm:w-48"
            value={unidadFiltro}
            onChange={(e) => {
              const nuevaUnidad = e.target.value as UnidadNegocio | "";
              setUnidadFiltro(nuevaUnidad);
              // Si el vendedor elegido ya no pertenece a la unidad nueva,
              // se limpia para no dejar un combo inconsistente.
              if (
                vendedorId &&
                nuevaUnidad &&
                unidadDe(vendedores.find((v) => v.id === vendedorId)?.unidad_negocio) !== nuevaUnidad
              ) {
                setVendedorId("");
              }
            }}
          >
            <option value="">Todas las unidades</option>
            {UNIDADES_NEGOCIO.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        {puedeVerTodo && (
          <select
            className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink sm:w-56"
            value={vendedorId}
            onChange={(e) => setVendedorId(e.target.value)}
          >
            <option value="">
              {unidadEfectiva ? `Todos (${unidadEfectiva})` : "Todos los vendedores"}
            </option>
            {vendedoresFiltrados.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-ink-muted">
          Estado
          <select
            className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink"
            value={estadoFiltro}
            onChange={(e) => {
              setEstadoFiltro(e.target.value as "activos" | "descartados" | "todos");
              setMotivoFiltro("");
            }}
          >
            <option value="activos">Activos</option>
            <option value="descartados">Descartados</option>
            <option value="todos">Todos (con descartados)</option>
          </select>
        </label>
        {estadoFiltro === "descartados" && (
          <label className="flex items-center gap-2 text-ink-muted">
            Motivo
            <select
              className="border border-line bg-card rounded-md px-3 py-2 text-sm text-ink"
              value={motivoFiltro}
              onChange={(e) => setMotivoFiltro(e.target.value)}
            >
              <option value="">Todos los motivos</option>
              {MOTIVOS_NO_APTO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="sin_clasificar">Sin clasificar (descartes anteriores)</option>
            </select>
          </label>
        )}
      </div>

      {puedeVerTodo && texto.trim() && (
        <p className="text-xs text-ink-muted">
          {esAdminUnidad
            ? `La búsqueda revisa los clientes de tu unidad (${miUnidad}), para confirmar si ya existen y de quién son.`
            : "La búsqueda revisa todos los clientes de la empresa (no solo los tuyos), para confirmar si ya existen y de quién son."}
        </p>
      )}

      {!puedeVerTodo && avisoOtros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          ⚠️ Ya existe{avisoOtros.length > 1 ? "n" : ""} cliente(s) con ese nombre/RFC, pero no
          {avisoOtros.length > 1 ? " son" : " es"} tuyo{avisoOtros.length > 1 ? "s" : ""}:{" "}
          {avisoOtros
            .map((a) => `${a.empresa} (de ${a.dueno_nombre || "otro vendedor"})`)
            .join(", ")}
          . Si crees que debería ser tuyo, contacta a Dirección Comercial.
        </div>
      )}

      <div className="rounded-lg border border-line bg-card divide-y max-h-[65vh] overflow-y-auto">
        {cargando ? (
          <p className="p-4 text-sm text-ink-muted">Buscando...</p>
        ) : resultados.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Sin resultados.</p>
        ) : (
          resultados.map((c) => {
            const esMio = puedeVerTodo || c.dueno_comercial_id === vendedor?.id;
            const contenido = (
              <>
                <div>
                  <p className="font-body font-semibold text-ink flex items-center gap-2">
                    {c.empresa}
                    {c.descartado && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 font-sans font-normal">
                        Descartado
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {c.ciudad || "Sin ciudad"} · {c.tipo_cliente} · {c.nivel_cuenta}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-sm text-ink-muted whitespace-nowrap">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: colorDeVendedor(c.dueno_comercial_id) }}
                  />
                  {c.dueno_nombre || "Sin asignar"}
                </span>
              </>
            );
            return esMio ? (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="p-4 flex items-center justify-between hover:bg-section"
              >
                {contenido}
              </Link>
            ) : (
              <div
                key={c.id}
                className="p-4 flex items-center justify-between bg-section/50"
              >
                {contenido}
              </div>
            );
          })
        )}
      </div>
      {!cargando && resultados.length > 0 && (
        <p className="text-xs text-ink-muted">
          Mostrando {resultados.length.toLocaleString("es-MX")} cliente(s). Baja con la barra de la
          lista para verlos todos.
        </p>
      )}
    </main>
  );
}
