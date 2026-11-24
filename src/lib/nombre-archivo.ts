/**
 * Nombre de archivo apto para el almacenamiento: sin acentos ni símbolos.
 * El almacenamiento rechaza nombres como "Cotización junio.pdf" ("Invalid key")
 * y corta los que llevan "#" (el resto del nombre se pierde en silencio).
 */
export function nombreSeguroArchivo(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto + 1) : "";
  const limpiar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const b = limpiar(base).slice(0, 80) || "archivo";
  const e = limpiar(extension).slice(0, 10);
  return e ? `${b}.${e}` : b;
}
