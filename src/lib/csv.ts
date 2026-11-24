/**
 * Parser de CSV mínimo (sin dependencias externas — evita librerías como
 * "xlsx" de npm, que tienen vulnerabilidades conocidas sin parche). Soporta
 * comillas dobles, comas dentro de campos entrecomillados, y comillas
 * escapadas (""). Detecta automáticamente el separador (coma o punto y
 * coma, común en CSV exportado por Excel en español).
 */
export function parseCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, ""); // quita BOM si lo trae
  const separador = (limpio.split("\n")[0] || "").includes(";") ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    const siguiente = limpio[i + 1];

    if (entreComillas) {
      if (c === '"' && siguiente === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\r") {
      // ignorar, \n lo maneja
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

function escapaCampo(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n\r;]/.test(texto)) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

/** Arma el texto CSV (con BOM para que Excel detecte acentos bien). */
export function aTextoCsv(
  encabezados: string[],
  filas: (string | number | null | undefined)[][]
): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(escapaCampo).join(","));
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

/** Genera el CSV y dispara la descarga en el navegador. */
export function descargarCsv(
  nombreArchivo: string,
  encabezados: string[],
  filas: (string | number | null | undefined)[][]
): void {
  const contenido = aTextoCsv(encabezados, filas);
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function filasAObjetos(filas: string[][]): Record<string, string>[] {
  if (filas.length === 0) return [];
  const encabezados = filas[0].map((h) => h.trim());
  return filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {};
    encabezados.forEach((h, i) => {
      obj[h] = (fila[i] ?? "").trim();
    });
    return obj;
  });
}
