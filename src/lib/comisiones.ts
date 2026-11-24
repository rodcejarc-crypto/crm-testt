import type { DatosMes, VentaConLineas } from "@/lib/data/comisiones";
import type { LineaProducto, MetaMensual } from "@/lib/types";

const LLAVE_PCT = 85; // % del piso de Piel para desbloquear la tarifa alta de PVC/Económico
const TARIFA_RECUPERADO = 4; // $/par, primera compra de una cuenta reactivada

export interface DesgloseComision {
  contextoKey: string;
  esUnidad: boolean;
  nombre: string;
  etiqueta: string | null;
  vendedorId: string | null;

  pisoPiel: number;
  metaTotal: number;

  pielPares: number;
  pvcPares: number;
  economicoPares: number;
  recuperadoPares: number;

  cumplimientoPct: number | null;
  llave: boolean;
  visitasRequeridas: number | null;
  visitasRealizadas: number;
  condicionVisitasCumplida: boolean;
  calificaAcelerador: boolean;

  comisionPiel: number;
  comisionPvc: number;
  comisionEconomico: number;
  comisionRecuperados: number;
  aceleradorBono: number;
  bonoTienda: number;
  bonoSucursal: number;

  total: number;
  advertencias: string[];
}

function sumaLineas(
  ventas: VentaConLineas[],
  linea: LineaProducto,
  soloNormales: boolean
): number {
  return ventas.reduce((s, v) => {
    if (soloNormales && v.es_primera_reactivacion) return s;
    const l = v.lineas.find((x) => x.linea === linea);
    return s + (l?.pares || 0);
  }, 0);
}

function paresRecuperados(ventas: VentaConLineas[]): number {
  return ventas
    .filter((v) => v.es_primera_reactivacion)
    .reduce((s, v) => s + v.lineas.reduce((s2, l) => s2 + l.pares, 0), 0);
}

/** Bono del acelerador: solo sobre Calzado de Piel, por tramos marginales. */
function calcularAcelerador(
  pielPares: number,
  piso: number,
  reglas: DatosMes["reglas"]
): number {
  if (piso <= 0 || pielPares <= piso) return 0;
  const tramos = [...reglas].sort((a, b) => a.umbral_pct - b.umbral_pct);
  let bono = 0;
  for (let i = 0; i < tramos.length; i++) {
    const desdePares = (piso * tramos[i].umbral_pct) / 100;
    const hastaPares =
      i + 1 < tramos.length ? (piso * tramos[i + 1].umbral_pct) / 100 : Infinity;
    const paresEnTramo = Math.max(0, Math.min(pielPares, hastaPares) - desdePares);
    bono += paresEnTramo * tramos[i].bono_por_par;
  }
  return bono;
}

function bonoTiendaNayeli(cumplimientoPct: number): number {
  if (cumplimientoPct >= 110) return 700;
  if (cumplimientoPct >= 100) return 500;
  if (cumplimientoPct >= 85) return 300;
  return 0;
}

export function calcularComisionesMes(datos: DatosMes): DesgloseComision[] {
  const { ventas, metas, tarifas, reglas, visitasRealizadas, vendedores, cancelaciones } = datos;

  const tarifaPiel = tarifas.find((t) => t.linea === "Calzado de Piel");
  const tarifaPvc = tarifas.find((t) => t.linea === "PVC");
  const tarifaEconomico = tarifas.find((t) => t.linea === "Calzado Económico");

  const nombrePorId = new Map(vendedores.map((v) => [v.id, v.nombre]));

  const metasVendedor = metas.filter((m) => m.tipo === "vendedor" && m.vendedor_id);
  const metasUnidad = metas.filter((m) => m.tipo === "unidad");

  const contextosPorVendedor = new Map<string, MetaMensual[]>();
  metasVendedor.forEach((m) => {
    const arr = contextosPorVendedor.get(m.vendedor_id as string) ?? [];
    arr.push(m);
    contextosPorVendedor.set(m.vendedor_id as string, arr);
  });

  // Cancelaciones netas (pares) por vendedor+contexto+línea, prorrateadas
  // según la mezcla de líneas de la venta original.
  const cancelacionPorContexto = new Map<
    string,
    { piel: number; pvc: number; economico: number }
  >();
  function keyDe(vendedorId: string | null, etiqueta: string | null) {
    return `${vendedorId ?? ""}::${etiqueta ?? ""}`;
  }
  cancelaciones.forEach((c) => {
    const v = c.venta;
    if (!v || v.pipeline !== "ventas" || !v.pares_vendidos || v.pares_vendidos <= 0) return;
    const k = keyDe(v.dueno_comercial_id, v.contexto_meta);
    const acc = cancelacionPorContexto.get(k) ?? { piel: 0, pvc: 0, economico: 0 };
    v.lineas.forEach((l) => {
      const proporcion = l.pares / (v.pares_vendidos as number);
      const paresCancelados = c.pares * proporcion;
      if (l.linea === "Calzado de Piel") acc.piel -= paresCancelados;
      if (l.linea === "PVC") acc.pvc -= paresCancelados;
      if (l.linea === "Calzado Económico") acc.economico -= paresCancelados;
    });
    cancelacionPorContexto.set(k, acc);
  });

  const resultados: DesgloseComision[] = [];

  // ------------------------------------------------------------- Vendedores
  for (const [vendedorId, contextos] of contextosPorVendedor) {
    const ventasVendedor = ventas.filter((v) => v.dueno_comercial_id === vendedorId);
    const multiplesContextos = contextos.length > 1;
    const nombre = nombrePorId.get(vendedorId) || "?";

    // Sales sin contexto asignado cuando hay más de uno: advertencia.
    const advertenciasVendedor: string[] = [];
    if (multiplesContextos) {
      const sinContexto = ventasVendedor.filter((v) => !v.contexto_meta);
      if (sinContexto.length > 0) {
        advertenciasVendedor.push(
          `${sinContexto.length} venta(s) sin contexto de meta asignado (no se contaron en ningún contexto).`
        );
      }
    }

    for (const ctx of contextos) {
      const ventasCtx = multiplesContextos
        ? ventasVendedor.filter((v) => v.contexto_meta === ctx.etiqueta)
        : ventasVendedor;

      const advertencias = [...advertenciasVendedor];
      const sinDesglose = ventasCtx.filter(
        (v) => v.lineas.length === 0 && (v.pares_vendidos || 0) > 0
      );
      if (sinDesglose.length > 0) {
        advertencias.push(
          `${sinDesglose.length} venta(s) sin desglose por línea, excluidas del cálculo.`
        );
      }

      const esNayeliTienda = ctx.etiqueta === "Tienda";

      const pielPares = sumaLineas(ventasCtx, "Calzado de Piel", false);
      const pvcParesNormal = sumaLineas(ventasCtx, "PVC", true);
      const economicoParesNormal = sumaLineas(ventasCtx, "Calzado Económico", true);
      const recuperado = paresRecuperados(ventasCtx);

      const cancel = cancelacionPorContexto.get(keyDe(vendedorId, ctx.etiqueta)) ?? {
        piel: 0,
        pvc: 0,
        economico: 0,
      };
      const pielParesNeto = Math.max(0, pielPares + cancel.piel);
      const pvcParesNeto = Math.max(0, pvcParesNormal + cancel.pvc);
      const economicoParesNeto = Math.max(0, economicoParesNormal + cancel.economico);

      const cumplimientoPct =
        ctx.piso_piel_pares > 0 ? (pielParesNeto / ctx.piso_piel_pares) * 100 : null;
      const llave = (cumplimientoPct ?? 0) >= LLAVE_PCT;

      let visitasReq = 0;
      if (ctx.visitas_requeridas) {
        const paraId = ctx.visitas_para_id ?? vendedorId;
        visitasReq = visitasRealizadas.filter(
          (v) => v.vendedor_id === vendedorId && v.realizada_para_id === paraId
        ).length;
      }
      const condicionVisitas = !ctx.visitas_requeridas || visitasReq >= ctx.visitas_requeridas;
      const calificaAcelerador = llave && condicionVisitas;

      if (esNayeliTienda) {
        // Caso especial: no cobra por línea, solo bono según cumplimiento
        // de su piso de tienda.
        const bono = bonoTiendaNayeli(cumplimientoPct ?? 0);
        resultados.push({
          contextoKey: ctx.id,
          esUnidad: false,
          nombre,
          etiqueta: ctx.etiqueta,
          vendedorId,
          pisoPiel: ctx.piso_piel_pares,
          metaTotal: ctx.meta_total_pares,
          pielPares: pielParesNeto,
          pvcPares: 0,
          economicoPares: 0,
          recuperadoPares: 0,
          cumplimientoPct,
          llave,
          visitasRequeridas: ctx.visitas_requeridas,
          visitasRealizadas: visitasReq,
          condicionVisitasCumplida: condicionVisitas,
          calificaAcelerador: false,
          comisionPiel: 0,
          comisionPvc: 0,
          comisionEconomico: 0,
          comisionRecuperados: 0,
          aceleradorBono: 0,
          bonoTienda: bono,
          bonoSucursal: 0,
          total: bono,
          advertencias,
        });
        continue;
      }

      const rPiel = tarifaPiel?.tarifa_por_par ?? 0; // Piel: siempre la misma tarifa
      const rPvc = llave ? tarifaPvc?.tarifa_por_par ?? 0 : tarifaPvc?.tarifa_sin_llave ?? 0;
      const rEco = llave
        ? tarifaEconomico?.tarifa_por_par ?? 0
        : tarifaEconomico?.tarifa_sin_llave ?? 0;

      // Los pares de "cliente recuperado" ya están incluidos en pielPares
      // (cuentan para el piso), pero se pagan aparte a tarifa plana — hay
      // que restarlos de la base de Piel para no pagarlos dos veces.
      const pielParesPagablesNormal = Math.max(0, pielParesNeto - recuperado);
      const comisionPielFinal = pielParesPagablesNormal * rPiel;
      const comisionRecuperados = recuperado * TARIFA_RECUPERADO;
      const comisionPvc = pvcParesNeto * rPvc;
      const comisionEconomico = economicoParesNeto * rEco;

      const acelerador = calificaAcelerador
        ? calcularAcelerador(pielParesNeto, ctx.piso_piel_pares, reglas)
        : 0;

      let bonoTienda = 0;
      // Sarahí: bono conjunto de tienda si ella y el conjunto (ella + Nayeli-Tienda) cumplen.
      if (nombre.toLowerCase().includes("sarahi") || nombre.toLowerCase().includes("sarahí")) {
        const nayeliTienda = resultados.find((r) => r.etiqueta === "Tienda");
        if (nayeliTienda && cumplimientoPct !== null) {
          const metaConjuntaPiso = ctx.piso_piel_pares + nayeliTienda.pisoPiel;
          const realConjunto = pielParesNeto + nayeliTienda.pielPares;
          const cumplimientoConjuntoPct =
            metaConjuntaPiso > 0 ? (realConjunto / metaConjuntaPiso) * 100 : 0;
          const individualCumple = cumplimientoPct >= 100;
          if (individualCumple && cumplimientoConjuntoPct >= 110) bonoTienda = 1800;
          else if (individualCumple && cumplimientoConjuntoPct >= 100) bonoTienda = 1200;
          if (bonoTienda > 0) {
            advertencias.push(
              "Bono de tienda de Sarahí: cálculo estimado (fórmula exacta pendiente de confirmar)."
            );
          }
        }
      }

      const total =
        comisionPielFinal + comisionPvc + comisionEconomico + comisionRecuperados + acelerador + bonoTienda;

      resultados.push({
        contextoKey: ctx.id,
        esUnidad: false,
        nombre,
        etiqueta: ctx.etiqueta,
        vendedorId,
        pisoPiel: ctx.piso_piel_pares,
        metaTotal: ctx.meta_total_pares,
        pielPares: pielParesNeto,
        pvcPares: pvcParesNeto,
        economicoPares: economicoParesNeto,
        recuperadoPares: recuperado,
        cumplimientoPct,
        llave,
        visitasRequeridas: ctx.visitas_requeridas,
        visitasRealizadas: visitasReq,
        condicionVisitasCumplida: condicionVisitas,
        calificaAcelerador,
        comisionPiel: comisionPielFinal,
        comisionPvc,
        comisionEconomico,
        comisionRecuperados,
        aceleradorBono: acelerador,
        bonoTienda,
        bonoSucursal: 0,
        total,
        advertencias,
      });
    }
  }

  // -------------------------------------------------------------- Unidades
  for (const ctx of metasUnidad) {
    const miembros = vendedores.filter(
      (v) =>
        v.unidad_negocio &&
        ctx.unidad_negocio &&
        v.unidad_negocio.toLowerCase().includes(ctx.unidad_negocio.toLowerCase())
    );
    const paresPorMiembro = miembros.map((v) => ({
      vendedor: v,
      pares: ventas
        .filter((venta) => venta.dueno_comercial_id === v.id && venta.pipeline === "ventas")
        .reduce((s, venta) => s + (venta.pares_vendidos || 0), 0),
    }));
    const totalUnidad = paresPorMiembro.reduce((s, m) => s + m.pares, 0);
    const advertencias: string[] = [];
    const todosAportan15 =
      totalUnidad > 0 &&
      paresPorMiembro.every((m) => m.pares / totalUnidad >= 0.15);
    if (!todosAportan15 && paresPorMiembro.length > 0) {
      advertencias.push(
        "No todos los ejecutivos de la sucursal aportaron al menos 15% del volumen — bono de sucursal no aplica."
      );
    }

    const totalNacional = ventas
      .filter((v) => v.pipeline === "ventas")
      .reduce((s, v) => s + (v.pares_vendidos || 0), 0);
    const andres = miembros.find((m) => m.nombre.toLowerCase().includes("andres") || m.nombre.toLowerCase().includes("andrés"));
    if (andres && totalNacional < 35000) {
      advertencias.push(
        `La planta nacional vendió ${totalNacional} pares (necesita 35,000+) — la comisión de Andrés no se paga este mes.`
      );
    }
    advertencias.push(
      "Bono de sucursal en $0: falta definir el % de margen y de dónde tomar el costo por venta."
    );

    resultados.push({
      contextoKey: ctx.id,
      esUnidad: true,
      nombre: `🏢 ${ctx.unidad_negocio}`,
      etiqueta: null,
      vendedorId: null,
      pisoPiel: ctx.piso_piel_pares,
      metaTotal: ctx.meta_total_pares,
      pielPares: 0,
      pvcPares: 0,
      economicoPares: 0,
      recuperadoPares: 0,
      cumplimientoPct: ctx.piso_piel_pares > 0 ? (totalUnidad / ctx.piso_piel_pares) * 100 : null,
      llave: false,
      visitasRequeridas: null,
      visitasRealizadas: 0,
      condicionVisitasCumplida: true,
      calificaAcelerador: false,
      comisionPiel: 0,
      comisionPvc: 0,
      comisionEconomico: 0,
      comisionRecuperados: 0,
      aceleradorBono: 0,
      bonoTienda: 0,
      bonoSucursal: 0,
      total: 0,
      advertencias,
    });
  }

  return resultados;
}
