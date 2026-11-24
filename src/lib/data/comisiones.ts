import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MetaMensual,
  ReglaAcelerador,
  TarifaMensual,
  Vendedor,
  VentaCancelacion,
  VentaCerrada,
  VentaLinea,
} from "@/lib/types";

export interface VentaConLineas extends VentaCerrada {
  lineas: VentaLinea[];
  /** Días desde la última compra del cliente antes de reactivarse (solo pipeline recuperación). */
  dias_sin_comprar: number | null;
  /** true si es la primera venta de recuperación registrada para este cliente (histórico completo). */
  es_primera_reactivacion: boolean;
}

export interface CancelacionConVenta extends VentaCancelacion {
  venta: {
    dueno_comercial_id: string | null;
    contexto_meta: string | null;
    pares_vendidos: number | null;
    pipeline: string;
    lineas: VentaLinea[];
  } | null;
}

export interface DatosMes {
  anioMes: string;
  ventas: VentaConLineas[];
  cancelaciones: CancelacionConVenta[];
  metas: MetaMensual[];
  tarifas: TarifaMensual[];
  reglas: ReglaAcelerador[];
  visitasRealizadas: { vendedor_id: string; realizada_para_id: string; fecha: string }[];
  vendedores: Vendedor[];
}

function primerYUltimoDia(anioMes: string): { desde: string; hasta: string } {
  const [y, m] = anioMes.split("-").map(Number);
  const desde = `${anioMes}-01`;
  const ultimoDia = new Date(y, m, 0).getDate();
  const hasta = `${anioMes}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}

/**
 * Junta todos los datos crudos que necesita el motor de comisiones para un
 * mes. Por default usa el cliente de navegador (para las pantallas del
 * CRM); el cron mensual de correo le pasa un cliente "admin" (service_role)
 * porque corre en el servidor, sin sesión de usuario.
 */
export async function obtenerDatosMes(
  anioMes: string,
  clienteExterno?: SupabaseClient
): Promise<DatosMes> {
  const supabase = clienteExterno ?? createClient();
  const { desde, hasta } = primerYUltimoDia(anioMes);

  const [ventasRes, tarifasRes, reglasRes, metasRes, vendedoresRes, visitasRes] =
    await Promise.all([
      supabase
        .from("ventas_cerradas")
        .select(
          "*, oportunidad:oportunidades(fecha_ultima_compra), lineas:ventas_lineas(*)"
        )
        .eq("estado_cobro", "Cobrada")
        .gte("fecha_cierre", desde)
        .lte("fecha_cierre", `${hasta}T23:59:59`)
        .in("pipeline", ["ventas", "recuperacion"]),
      supabase.from("tarifas_mensuales").select("*").eq("anio_mes", anioMes),
      supabase.from("reglas_acelerador").select("*").eq("anio_mes", anioMes).order("orden"),
      supabase.from("metas_mensuales").select("*").eq("anio_mes", anioMes),
      supabase.from("vendedores").select("*"),
      supabase
        .from("visitas")
        .select("vendedor_id, realizada_para_id, fecha")
        .eq("estado", "realizada")
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ]);

  // Cancelaciones registradas en este mes (sin importar el mes de la venta
  // original) — trae también las líneas de la venta original, para poder
  // repartir los pares cancelados en la misma proporción por línea.
  const { data: cancelacionesData, error: errCancel } = await supabase
    .from("ventas_cancelaciones")
    .select(
      "*, venta:ventas_cerradas(dueno_comercial_id, contexto_meta, pares_vendidos, pipeline, lineas:ventas_lineas(*))"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (errCancel) throw errCancel;

  if (ventasRes.error) throw ventasRes.error;

  const crudasVentas = (ventasRes.data ?? []) as unknown as (VentaCerrada & {
    oportunidad: { fecha_ultima_compra: string | null } | null;
    lineas: VentaLinea[];
  })[];

  // Para cada cliente con una venta de recuperación este mes, busca si ya
  // tenía una venta de recuperación ANTERIOR (en cualquier mes) — así
  // sabemos si esta es su primera reactivación o no.
  const clienteIdsRecuperacion = Array.from(
    new Set(
      crudasVentas
        .filter((v) => v.pipeline === "recuperacion" && v.cliente_id)
        .map((v) => v.cliente_id as string)
    )
  );
  const primeraFechaPorCliente = new Map<string, string>();
  if (clienteIdsRecuperacion.length > 0) {
    const { data: previas, error: errPrevias } = await supabase
      .from("ventas_cerradas")
      .select("cliente_id, fecha_cierre")
      .eq("pipeline", "recuperacion")
      .in("cliente_id", clienteIdsRecuperacion);
    if (errPrevias) throw errPrevias;
    (previas ?? []).forEach((p) => {
      if (!p.cliente_id) return;
      const actual = primeraFechaPorCliente.get(p.cliente_id);
      if (!actual || p.fecha_cierre < actual) {
        primeraFechaPorCliente.set(p.cliente_id, p.fecha_cierre);
      }
    });
  }

  const ventas: VentaConLineas[] = crudasVentas.map((raw) => {
    let dias: number | null = null;
    if (raw.oportunidad?.fecha_ultima_compra) {
      const ms =
        new Date(raw.fecha_cierre).getTime() -
        new Date(raw.oportunidad.fecha_ultima_compra + "T00:00:00").getTime();
      dias = Math.floor(ms / 86400000);
    }
    const esPrimera =
      raw.pipeline === "recuperacion" &&
      raw.cliente_id !== null &&
      primeraFechaPorCliente.get(raw.cliente_id) === raw.fecha_cierre;
    return {
      ...raw,
      lineas: raw.lineas ?? [],
      dias_sin_comprar: dias,
      es_primera_reactivacion: esPrimera,
    };
  });

  return {
    anioMes,
    ventas,
    cancelaciones: (cancelacionesData ?? []) as unknown as CancelacionConVenta[],
    metas: (metasRes.data ?? []) as MetaMensual[],
    tarifas: (tarifasRes.data ?? []) as TarifaMensual[],
    reglas: (reglasRes.data ?? []) as ReglaAcelerador[],
    visitasRealizadas: visitasRes.data ?? [],
    vendedores: (vendedoresRes.data ?? []) as Vendedor[],
  };
}
