/** Mes en que se cuenta una venta: el actual o el anterior. */
export interface OpcionMesVenta {
  clave: "actual" | "anterior";
  etiqueta: string;
  /** Fecha de cierre que se guarda: ahora (mes actual) o el último día del mes anterior al mediodía. */
  fechaCierre: () => string;
}

const nombreMes = (d: Date) => {
  const t = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function opcionesMesVenta(hoy = new Date()): OpcionMesVenta[] {
  const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 12, 0, 0);
  return [
    { clave: "actual", etiqueta: nombreMes(hoy), fechaCierre: () => new Date().toISOString() },
    { clave: "anterior", etiqueta: nombreMes(finMesAnterior), fechaCierre: () => finMesAnterior.toISOString() },
  ];
}

/** Mes (etiqueta) en que cuenta una fecha de cierre ya guardada. */
export const etiquetaMesDe = (iso: string) => nombreMes(new Date(iso));

/** Días del mes nuevo durante los que un vendedor aún puede contar una venta en el mes anterior. */
export const DIAS_PARA_MES_ANTERIOR = 7;

/**
 * ¿Puede elegir que una venta cuente en el mes anterior? La administración, siempre;
 * un vendedor, solo en los primeros días del mes (cuando está cerrando lo que no alcanzó).
 */
export function puedeContarEnMesAnterior(esAdministracion: boolean, hoy = new Date()): boolean {
  return esAdministracion || hoy.getDate() <= DIAS_PARA_MES_ANTERIOR;
}
