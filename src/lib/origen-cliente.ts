/** Nombre legible de la lista de la que viene un cliente (null = cartera de siempre). */
const ORIGENES: Record<string, string> = {
  lista_guadalajara_2026_11: "Prospecto — lista Guadalajara (nov 2026)",
  lista_guerrero_2026_11: "Prospecto — posible distribuidor Guerrero (nov 2026)",
};

export const etiquetaOrigen = (origen: string | null | undefined): string | null =>
  origen ? ORIGENES[origen] ?? origen : null;
