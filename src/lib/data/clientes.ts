import { createClient } from "@/lib/supabase/client";
import { cerrarOportunidad, listarOportunidadesPorCliente } from "@/lib/data/oportunidades";
import type { Cliente, ClienteBusquedaGlobal } from "@/lib/types";

const SELECT_CON_DUENO =
  "*, dueno:vendedores!clientes_dueno_comercial_id_fkey(id, nombre, unidad_negocio), " +
  "grupo:grupos_clientes(id, nombre), " +
  "descartado_por_vendedor:vendedores!clientes_descartado_por_fkey(id, nombre)";

export async function buscarClientes(opts: {
  texto?: string;
  vendedorId?: string;
  /** Filtra por varios vendedores a la vez (p. ej. todos los de una unidad de negocio). Se ignora si se pasa vendedorId. */
  vendedorIds?: string[];
  /** Por default no trae los descartados (clientes ilocalizables ya dados de baja del listado). */
  incluirDescartados?: boolean;
  /** Solo los descartados (para la revisión de la administración). */
  soloDescartados?: boolean;
  /** Descartados de un motivo ("sin_clasificar" = los descartes viejos sin motivo de la lista). */
  motivoDescarte?: string;
}): Promise<Cliente[]> {
  const supabase = createClient();
  // Supabase entrega máx. 1000 filas por consulta: se pide por páginas hasta
  // traer TODOS (antes se cortaba en 100 y el listado terminaba en la "G").
  const PAGINA = 1000;
  const todos: Cliente[] = [];
  let desde = 0;
  for (;;) {
    let query = supabase.from("clientes").select(SELECT_CON_DUENO);
    if (opts.texto && opts.texto.trim()) {
      const t = opts.texto.trim();
      query = query.or(`empresa.ilike.%${t}%,ciudad.ilike.%${t}%,rfc.ilike.%${t}%`);
    }
    if (opts.vendedorId) {
      query = query.eq("dueno_comercial_id", opts.vendedorId);
    } else if (opts.vendedorIds) {
      query = query.in("dueno_comercial_id", opts.vendedorIds);
    }
    query = filtrarDescarte(query, opts);
    const { data, error } = await query
      .order("empresa")
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = data as unknown as Cliente[];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
    desde += PAGINA;
  }
  return todos;
}

type OpcionesDescarte = { incluirDescartados?: boolean; soloDescartados?: boolean; motivoDescarte?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtrarDescarte<Q extends { eq: (c: string, v: any) => Q; is: (c: string, v: any) => Q }>(
  query: Q,
  opts: OpcionesDescarte
): Q {
  if (opts.soloDescartados) {
    query = query.eq("descartado", true);
    if (opts.motivoDescarte === "sin_clasificar") query = query.is("motivo_descarte_tipo", null);
    else if (opts.motivoDescarte) query = query.eq("motivo_descarte_tipo", opts.motivoDescarte);
  } else if (!opts.incluirDescartados) {
    query = query.eq("descartado", false);
  }
  return query;
}

/** Búsqueda corta por nombre o RFC (máx. 10), para selectores. RLS limita a los clientes que puedes ver. */
export async function buscarClientesRapido(texto: string): Promise<Pick<Cliente, "id" | "empresa" | "rfc" | "ciudad">[]> {
  const t = texto.trim();
  if (t.length < 2) return [];
  const supabase = createClient();
  const limpio = t.replace(/[%,()]/g, " ");
  const { data, error } = await supabase
    .from("clientes")
    .select("id, empresa, rfc, ciudad")
    .eq("descartado", false)
    .or(`empresa.ilike.%${limpio}%,rfc.ilike.%${limpio}%`)
    .order("empresa")
    .limit(10);
  if (error) throw error;
  return (data ?? []) as Pick<Cliente, "id" | "empresa" | "rfc" | "ciudad">[];
}

/**
 * Búsqueda global de solo lectura: encuentra clientes de CUALQUIER
 * vendedor (para evitar duplicados y saber "¿ya es cliente? ¿de quién?").
 * Trae solo datos básicos, nunca la ficha completa de alguien más.
 */
export async function buscarClientesGlobal(
  texto: string
): Promise<ClienteBusquedaGlobal[]> {
  if (!texto || !texto.trim()) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("buscar_clientes_global", {
    p_texto: texto.trim(),
  });
  if (error) throw error;
  return (data ?? []) as ClienteBusquedaGlobal[];
}

export async function obtenerCliente(id: string): Promise<Cliente | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select(SELECT_CON_DUENO)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Cliente | null;
}

export interface ClienteSimilar {
  id: string;
  empresa: string;
  ciudad: string | null;
  dueno_comercial_id: string | null;
  dueno_nombre: string | null;
  similitud: number;
}

export async function buscarClientesSimilares(
  nombre: string
): Promise<ClienteSimilar[]> {
  if (!nombre || nombre.trim().length < 3) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("buscar_clientes_similares", {
    p_nombre: nombre.trim(),
  });
  if (error) throw error;
  return (data ?? []) as ClienteSimilar[];
}

export type NuevoCliente = Partial<
  Omit<Cliente, "id" | "created_at" | "updated_at" | "dueno">
> & { empresa: string };

export async function crearCliente(datos: NuevoCliente): Promise<Cliente> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .insert(datos)
    .select(SELECT_CON_DUENO)
    .single();
  if (error) throw error;
  return data as unknown as Cliente;
}

/**
 * Cuenta clientes sin traer las filas (para el contador de arriba de la
 * pantalla). RLS ya limita a "los míos" si no eres admin.
 */
export async function contarClientes(
  opts: { vendedorId?: string; vendedorIds?: string[] } & OpcionesDescarte = {}
): Promise<number> {
  const supabase = createClient();
  let query = supabase.from("clientes").select("id", { count: "exact", head: true });
  if (opts.vendedorId) {
    query = query.eq("dueno_comercial_id", opts.vendedorId);
  } else if (opts.vendedorIds) {
    query = query.in("dueno_comercial_id", opts.vendedorIds);
  }
  query = filtrarDescarte(query, opts);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Trae TODOS los clientes para exportar a CSV — sin el límite de 100 de
 * `buscarClientes` (esa es para la vista en pantalla). RLS ya se encarga
 * de que un vendedor solo pueda traer los suyos; el admin trae todos.
 * Supabase tope a 1000 filas por consulta, así que pagina hasta agotarlas.
 */
export async function exportarClientes(
  opts: { vendedorId?: string; vendedorIds?: string[] } & OpcionesDescarte = {}
): Promise<Cliente[]> {
  const supabase = createClient();
  const PAGINA = 1000;
  const todos: Cliente[] = [];
  let desde = 0;
  for (;;) {
    let query = supabase.from("clientes").select(SELECT_CON_DUENO);
    if (opts.vendedorId) {
      query = query.eq("dueno_comercial_id", opts.vendedorId);
    } else if (opts.vendedorIds) {
      query = query.in("dueno_comercial_id", opts.vendedorIds);
    }
    query = filtrarDescarte(query, opts);
    const { data, error } = await query
      .order("empresa")
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = data as unknown as Cliente[];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
    desde += PAGINA;
  }
  return todos;
}

/**
 * Inserta muchos clientes de un jalón (pantalla de carga masiva). Devuelve
 * cuántos se crearon; si Supabase rechaza el lote completo, la pantalla
 * decide cómo mostrarlo.
 */
export async function crearClientesEnLote(filas: NuevoCliente[]): Promise<number> {
  if (filas.length === 0) return 0;
  const supabase = createClient();
  let creados = 0;
  for (let i = 0; i < filas.length; i += 300) {
    const lote = filas.slice(i, i + 300);
    const { error, count } = await supabase
      .from("clientes")
      .insert(lote, { count: "exact" });
    if (error) throw error;
    creados += count ?? lote.length;
  }
  return creados;
}

export async function actualizarCliente(
  id: string,
  datos: Partial<NuevoCliente>
): Promise<Cliente> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clientes")
    .update(datos)
    .eq("id", id)
    .select(SELECT_CON_DUENO)
    .single();
  if (error) throw error;
  return data as unknown as Cliente;
}

/**
 * "Elimina" un cliente ilocalizable de la base sin borrar su historial: lo
 * marca como descartado con un motivo obligatorio (que quede documentado
 * qué pasó — no contestó, no se consiguió teléfono, ya no existe, etc.),
 * cierra como "perdida" cualquier oportunidad abierta que tuviera (para que
 * no quede una tarjeta viva en el Kanban ni seguimientos pendientes), y
 * desaparece del listado normal de Clientes.
 */
export async function descartarCliente(
  clienteId: string,
  motivo: string,
  descartadoPor: string | null
): Promise<void> {
  const supabase = createClient();

  const oportunidades = await listarOportunidadesPorCliente(clienteId);
  for (const op of oportunidades.filter((o) => o.estado_cierre === "abierta")) {
    await cerrarOportunidad(op.id, op.pipeline, "perdida", "sin_respuesta", motivo);
  }

  const { error } = await supabase
    .from("clientes")
    .update({
      descartado: true,
      motivo_descarte: motivo.trim(),
      descartado_en: new Date().toISOString(),
      descartado_por: descartadoPor,
    })
    .eq("id", clienteId);
  if (error) throw error;
}

/** Deshace un descarte hecho por error: el cliente vuelve a aparecer en el listado normal. */
export async function reactivarCliente(clienteId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      descartado: false,
      motivo_descarte: null,
      descartado_en: null,
      descartado_por: null,
    })
    .eq("id", clienteId);
  if (error) throw error;
}
