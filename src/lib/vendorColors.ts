// Un color consistente por vendedor en todo el sistema (círculo de iniciales
// en las tarjetas del Kanban, píldoras del buscador, ranking del dashboard).
// Se deriva del id del vendedor, así que siempre es el mismo color para la
// misma persona, sin necesidad de guardar nada extra en la base de datos.

const PALETA = [
  "hsl(206 55% 45%)", // azul
  "hsl(160 45% 38%)", // verde azulado
  "hsl(35 70% 45%)", // ámbar
  "hsl(266 35% 48%)", // morado
  "hsl(15 65% 48%)", // naranja quemado
  "hsl(192 50% 38%)", // teal
  "hsl(340 50% 48%)", // magenta
  "hsl(90 35% 38%)", // verde oliva
  "hsl(230 40% 50%)", // azul violeta
  "hsl(25 60% 42%)", // canela
  "hsl(280 30% 45%)", // púrpura
  "hsl(200 30% 40%)", // azul grisáceo
];

const SIN_ASIGNAR = "hsl(30 8% 55%)";

export function colorDeVendedor(id: string | null | undefined): string {
  if (!id) return SIN_ASIGNAR;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETA[hash % PALETA.length];
}

export function inicialesDe(nombre: string | null | undefined): string {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const primeras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return primeras.join("") || "?";
}
