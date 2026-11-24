/**
 * Lee el archivo .html de una factura (CFDI) que genera el sistema de
 * facturación de Rhinoboots y saca de ahí los renglones (estilo, pares,
 * precio) para prellenar "Renglones del pedido". Se probó que ese .html
 * trae la información en tablas reales y se puede leer de forma confiable;
 * el PDF de la misma factura NO (el texto sale desordenado al extraerlo),
 * así que esta función solo acepta el .html.
 *
 * Todo esto corre en el navegador (nada se sube a un servidor) y nunca se
 * guarda solo: el vendedor siempre revisa y confirma antes de "Guardar
 * renglones".
 */

export interface RenglonLeido {
  estilo: string;
  pares: number;
  precioUnitario: number;
}

export interface FacturaLeida {
  folio: string | null;
  fecha: string | null;
  clienteNombre: string | null;
  clienteRfc: string | null;
  ejecutivo: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  uuid: string | null;
  renglones: RenglonLeido[];
}

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&oacute;": "ó",
  "&Oacute;": "Ó",
  "&aacute;": "á",
  "&Aacute;": "Á",
  "&eacute;": "é",
  "&Eacute;": "É",
  "&iacute;": "í",
  "&Iacute;": "Í",
  "&uacute;": "ú",
  "&Uacute;": "Ú",
  "&ntilde;": "ñ",
  "&Ntilde;": "Ñ",
};

/**
 * Convierte el HTML en una sola línea de texto, con "|" donde había una
 * etiqueta — así se conserva el orden y la separación de cada celda de las
 * tablas, sin ejecutar nada del archivo (no se usa DOMParser ni se inserta
 * en la página: es puro texto).
 */
function aTextoPlano(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/src\s*=\s*"data:image\/[^"]*"/gi, "");
  s = s.replace(/<[^>]+>/g, " | ");
  s = s.replace(/&#(\d+);/g, (_, cod) => String.fromCharCode(Number(cod)));
  for (const [entidad, real] of Object.entries(ENTIDADES)) {
    s = s.split(entidad).join(real);
  }
  s = s.replace(/\s+/g, " ");
  s = s.replace(/(\|\s*){2,}/g, "| ");
  return s.trim();
}

function aNumero(txt: string | null | undefined): number | null {
  if (!txt) return null;
  const n = Number(txt.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function campo(texto: string, etiqueta: string): string | null {
  const escapada = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // La etiqueta debe ser su propia celda (empieza justo tras un "|" o al
  // inicio del texto) para no confundirla con la palabra suelta dentro de
  // otra frase, p. ej. "Facturas Cliente" no debe contarse como "Cliente:".
  const re = new RegExp(
    `(?<=^|\\|)\\s*${escapada}\\s*:?\\s*\\|\\s*([^|]+?)\\s*\\|`,
    "i"
  );
  const m = texto.match(re);
  return m ? m[1].trim() : null;
}

export function leerFacturaHtmlDesdeTexto(html: string): FacturaLeida {
  const texto = aTextoPlano(html);

  const uuidMatch = texto.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );

  // Cada renglón de la tabla de productos viene como 9 celdas seguidas:
  // Cantidad | Unidad | Estilo/descripción | clave SAT - descripción SAT |
  // Valor unitario | (descuento) | IVA base | Importe | Importe (repetido).
  const renglones: RenglonLeido[] = [];
  // Ojo: el "|" que separa dos renglones seguidos es compartido (el final
  // de uno es el inicio del siguiente), así que los límites de cada
  // coincidencia usan lookaround (no se "comen" el separador) — si no, el
  // siguiente renglón se salta al no encontrar su "|" inicial.
  const reRenglon =
    /(?<=\|)\s*(\d+(?:\.\d+)?)\s*\|\s*[^|]{1,20}?\s*\|\s*([^|]+?)\s*\|\s*\d{6,}[^|]*?\s*\|\s*([\d,]+(?:\.\d+)?)\s*\|\s*[^|]*?\s*\|\s*[\d,.]+\s*\|\s*[\d,]+(?:\.\d+)?\s*\|\s*[\d,]+(?:\.\d+)?\s*(?=\|)/g;
  let m: RegExpExecArray | null;
  while ((m = reRenglon.exec(texto))) {
    const pares = aNumero(m[1]);
    const precioUnitario = aNumero(m[3]);
    const estilo = m[2].trim();
    if (pares && precioUnitario) {
      renglones.push({ estilo, pares, precioUnitario });
    }
  }

  return {
    folio: campo(texto, "Folio"),
    fecha: campo(texto, "Fecha"),
    clienteNombre: campo(texto, "Cliente"),
    clienteRfc: campo(texto, "R.F.C."),
    ejecutivo: campo(texto, "Ejecutivo"),
    subtotal: aNumero(campo(texto, "Subtotal")),
    iva: aNumero(campo(texto, "Impuestos Trasladados")),
    total: aNumero(campo(texto, "Total")),
    uuid: uuidMatch ? uuidMatch[0].toUpperCase() : null,
    renglones,
  };
}

export async function leerFacturaHtml(file: File): Promise<FacturaLeida> {
  const html = await file.text();
  return leerFacturaHtmlDesdeTexto(html);
}
