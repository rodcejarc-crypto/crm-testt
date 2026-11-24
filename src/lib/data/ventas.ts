import { createClient } from "@/lib/supabase/client";
import type { EstadoCobro, LineaPedido, VentaCancelacion, VentaCerrada, VentaLinea } from "@/lib/types";

export interface FiltrosVentas {
  vendedorId?: string;
  unidadNegocio?: string;
  desde?: string; // YYYY-MM-DD
  hasta?: string; // YYYY-MM-DD
}

export async function listarVentasCerradas(
  filtros: FiltrosVentas = {}
): Promise<VentaCerrada[]> {
  const supabase = createClient();
  let query = supabase.from("ventas_cerradas").select("*");

  if (filtros.vendedorId) {
    query = query.eq("dueno_comercial_id", filtros.vendedorId);
  }
  if (filtros.unidadNegocio) {
    query = query.eq("unidad_negocio", filtros.unidadNegocio);
  }
  if (filtros.desde) {
    query = query.gte("fecha_cierre", filtros.desde);
  }
  if (filtros.hasta) {
    // incluye todo el día "hasta"
    query = query.lte("fecha_cierre", `${filtros.hasta}T23:59:59`);
  }

  const { data, error } = await query.order("fecha_cierre", { ascending: false });
  if (error) throw error;
  return data as VentaCerrada[];
}

/**
 * Elimina una venta duplicada por error (junto con su oportunidad duplicada).
 * Queda guardada una copia con el motivo, quién la eliminó y cuándo. Si la
 * venta ya está cobrada, solo un administrador puede eliminarla.
 */
export async function eliminarVentaDuplicada(ventaId: string, motivo: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("eliminar_venta_duplicada", {
    p_venta: ventaId,
    p_motivo: motivo,
  });
  if (error) throw error;
}

export async function actualizarFactura(id: string, factura: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ventas_cerradas")
    .update({ factura: factura || null })
    .eq("id", id);
  if (error) throw error;
}

export async function actualizarContextoMeta(id: string, contexto: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ventas_cerradas")
    .update({ contexto_meta: contexto || null })
    .eq("id", id);
  if (error) throw error;
}

export async function actualizarCobro(
  id: string,
  estado: EstadoCobro,
  fechaCobro: string | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ventas_cerradas")
    .update({ estado_cobro: estado, fecha_cobro: fechaCobro })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------- Líneas

export async function listarLineasDeVenta(ventaId: string): Promise<VentaLinea[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ventas_lineas")
    .select("*")
    .eq("venta_id", ventaId);
  if (error) throw error;
  return data as VentaLinea[];
}

export async function guardarLineasDeVenta(
  ventaId: string,
  lineas: { linea: LineaPedido; pares: number; monto: number }[]
): Promise<void> {
  const supabase = createClient();
  // Reemplaza el desglose completo (más simple y evita duplicados).
  const { error: delErr } = await supabase.from("ventas_lineas").delete().eq("venta_id", ventaId);
  if (delErr) throw delErr;
  const filas = lineas
    .filter((l) => l.pares > 0 || l.monto > 0)
    .map((l) => ({ venta_id: ventaId, ...l }));
  if (filas.length === 0) return;
  const { error } = await supabase.from("ventas_lineas").insert(filas);
  if (error) throw error;
}

// ------------------------------------------------------------ Cancelaciones

export async function listarCancelaciones(ventaId: string): Promise<VentaCancelacion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ventas_cancelaciones")
    .select("*")
    .eq("venta_id", ventaId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return data as VentaCancelacion[];
}

export async function registrarCancelacion(datos: {
  venta_id: string;
  fecha: string;
  pares: number;
  monto: number;
  motivo?: string;
  registrado_por?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("ventas_cancelaciones").insert(datos);
  if (error) throw error;
}

/** La venta cerrada que salió de una oportunidad (si ya se cerró como ganada). */
export async function obtenerVentaPorOportunidad(oportunidadId: string): Promise<VentaCerrada | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ventas_cerradas")
    .select("*")
    .eq("oportunidad_id", oportunidadId)
    .maybeSingle();
  if (error) throw error;
  return data as VentaCerrada | null;
}
