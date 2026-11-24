import writeExcelFile from "write-excel-file/browser";

type Celda = string | number | null | undefined;

/**
 * Genera y descarga un archivo Excel (.xlsx) real: una tabla con
 * encabezados en negritas, columnas ordenadas y del ancho justo, y la
 * fila de encabezados fija al hacer scroll. (Se usa esta librería, que
 * solo ESCRIBE archivos — no lee — para no meter la vulnerabilidad
 * conocida de la librería "xlsx".)
 */
export async function descargarExcel(
  nombreArchivo: string,
  encabezados: string[],
  filas: Celda[][],
  hoja = "Clientes"
): Promise<void> {
  const anchos = encabezados.map((h, i) => {
    let max = h.length;
    for (const fila of filas) {
      const largo = String(fila[i] ?? "").length;
      if (largo > max) max = largo;
    }
    return Math.min(Math.max(max + 2, 10), 45);
  });

  const datos = [
    encabezados.map((h) => ({
      value: h,
      fontWeight: "bold" as const,
      backgroundColor: "#EFE8D9",
    })),
    ...filas.map((fila) =>
      encabezados.map((_, i) => {
        const v = fila[i];
        return v === null || v === undefined || v === "" ? null : v;
      })
    ),
  ];

  await writeExcelFile(datos, {
    columns: anchos.map((width) => ({ width })),
    stickyRowsCount: 1,
    sheet: hoja,
  }).toFile(nombreArchivo);
}
