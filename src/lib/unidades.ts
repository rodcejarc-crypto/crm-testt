/**
 * Rhinoboots tiene 3 unidades de negocio reales, pero el texto libre que
 * carga cada vendedor en su ficha varía ("Vendedor de planta", "Vendedor de
 * planta / Coordinación comercial", "Encargado sucursal Guadalajara",
 * "Sucursal Guadalajara", "Tienda Purepero"...). Esta función agrupa
 * cualquiera de esos textos en una de las 3 unidades, para poder filtrar
 * clientes por unidad sin depender de que el texto sea idéntico.
 */
export const UNIDADES_NEGOCIO = ["Planta", "Tienda Purepero", "Guadalajara"] as const;

export type UnidadNegocio = (typeof UNIDADES_NEGOCIO)[number];

export function unidadDe(unidadTexto: string | null | undefined): UnidadNegocio | null {
  const t = (unidadTexto || "").toLowerCase();
  if (!t) return null;
  if (t.includes("purepero") || t.includes("tienda")) return "Tienda Purepero";
  if (t.includes("guadalajara")) return "Guadalajara";
  if (t.includes("planta")) return "Planta";
  return null;
}
