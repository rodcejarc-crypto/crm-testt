"use client";

import { useEffect, useMemo, useState } from "react";
import { crearClientesEnLote, type NuevoCliente } from "@/lib/data/clientes";
import { listarVendedores } from "@/lib/data/vendedores";
import { filasAObjetos, parseCsv } from "@/lib/csv";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { TipoCliente, Vendedor } from "@/lib/types";

// Campo del cliente -> encabezados posibles que reconocemos automáticamente
// en el CSV (sin importar mayúsculas/acentos).
const CAMPOS: { campo: string; label: string; alias: string[]; requerido?: boolean }[] = [
  { campo: "empresa", label: "Empresa", alias: ["empresa", "cliente", "nombre"], requerido: true },
  { campo: "rfc", label: "RFC", alias: ["rfc"] },
  { campo: "contacto", label: "Contacto", alias: ["contacto", "persona de contacto"] },
  { campo: "telefono", label: "Teléfono", alias: ["telefono", "teléfono", "tel"] },
  { campo: "email", label: "Correo", alias: ["email", "correo", "correo electronico"] },
  { campo: "redes_sociales", label: "Redes sociales", alias: ["redes sociales", "redes"] },
  { campo: "direccion", label: "Dirección", alias: ["direccion", "dirección", "domicilio"] },
  { campo: "ciudad", label: "Ciudad", alias: ["ciudad"] },
  { campo: "estado", label: "Estado", alias: ["estado"] },
  { campo: "tipo_cliente", label: "Tipo de cliente", alias: ["tipo de cliente", "tipo_cliente", "tipo"] },
  { campo: "nivel_cuenta", label: "Nivel de cuenta", alias: ["nivel de cuenta", "nivel_cuenta", "nivel"] },
  { campo: "cuenta_clave", label: "Cuenta clave", alias: ["cuenta clave", "cuenta_clave"] },
  { campo: "vendedor", label: "Vendedor (nombre)", alias: ["vendedor", "vendedor asignado", "dueño", "dueno"] },
];

function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function autoMapea(encabezados: string[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  CAMPOS.forEach(({ campo, alias }) => {
    const encontrado = encabezados.find((h) => alias.includes(normaliza(h)));
    if (encontrado) mapa[campo] = encontrado;
  });
  return mapa;
}

function descargarPlantilla() {
  const encabezados = CAMPOS.map((c) => c.label).join(",");
  const ejemplo =
    "Aceites Especiales SA de CV,AES010101AB1,Juan Pérez,3312345678,contacto@ejemplo.com,,Calle Reforma 123,Guadalajara,Jalisco,Nuevo,Estándar,,Alejandra Garcia";
  const contenido = "﻿" + encabezados + "\n" + ejemplo + "\n";
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_clientes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface FilaPreparada {
  datos: NuevoCliente;
  vendedorTexto: string;
  vendedorReconocido: boolean;
  error: string | null;
}

export default function ImportarClientesPage() {
  const { esAdmin, cargando: cargandoRol } = useVendedorActual();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasOriginales, setFilasOriginales] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarVendedores().then((vs) => setVendedores(vs.filter((v) => v.nombre !== "Sin asignar")));
  }, []);

  const vendedorPorNombre = useMemo(() => {
    const m = new Map<string, Vendedor>();
    vendedores.forEach((v) => m.set(normaliza(v.nombre), v));
    return m;
  }, [vendedores]);

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    setResultado(null);
    setNombreArchivo(archivo.name);
    const texto = await archivo.text();
    const filas = parseCsv(texto);
    if (filas.length < 2) {
      setError("El archivo no tiene filas de datos (solo encabezado, o está vacío).");
      return;
    }
    const objetos = filasAObjetos(filas);
    setEncabezados(filas[0].map((h) => h.trim()));
    setFilasOriginales(objetos);
    setMapeo(autoMapea(filas[0].map((h) => h.trim())));
  }

  const filasPreparadas: FilaPreparada[] = useMemo(() => {
    if (filasOriginales.length === 0) return [];
    return filasOriginales.map((fila) => {
      function val(campo: string): string {
        const col = mapeo[campo];
        return col ? (fila[col] || "").trim() : "";
      }
      const empresa = val("empresa");
      const vendedorTexto = val("vendedor");
      const vendedor = vendedorTexto ? vendedorPorNombre.get(normaliza(vendedorTexto)) : undefined;
      const tipoRaw = val("tipo_cliente");
      const tipoCliente: TipoCliente = tipoRaw === "Cartera" ? "Cartera" : "Nuevo";

      return {
        datos: {
          empresa,
          rfc: val("rfc") || null,
          contacto: val("contacto") || null,
          telefono: val("telefono") || null,
          email: val("email") || null,
          redes_sociales: val("redes_sociales") || null,
          direccion: val("direccion") || null,
          ciudad: val("ciudad") || null,
          estado: val("estado") || null,
          tipo_cliente: tipoCliente,
          cuenta_clave: val("cuenta_clave") || null,
          dueno_comercial_id: vendedor ? vendedor.id : null,
          nivel_cuenta:
            val("nivel_cuenta") === "Estratégica" || val("nivel_cuenta") === "Crecimiento"
              ? (val("nivel_cuenta") as "Estratégica" | "Crecimiento")
              : "Estándar",
        },
        vendedorTexto,
        vendedorReconocido: vendedorTexto ? Boolean(vendedor) : true,
        error: empresa ? null : "Falta el nombre de la empresa/cliente",
      };
    });
  }, [filasOriginales, mapeo, vendedorPorNombre]);

  const validas = filasPreparadas.filter((f) => !f.error);
  const conError = filasPreparadas.filter((f) => f.error);
  const sinVendedorReconocido = filasPreparadas.filter(
    (f) => f.vendedorTexto && !f.vendedorReconocido
  );

  async function onImportar() {
    setImportando(true);
    setError(null);
    try {
      const creados = await crearClientesEnLote(validas.map((f) => f.datos));
      setResultado({ creados, total: validas.length });
      setFilasOriginales([]);
      setEncabezados([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setImportando(false);
    }
  }

  if (cargandoRol) return <main className="max-w-4xl mx-auto p-6">Cargando...</main>;

  if (!esAdmin) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Esta sección es solo para Dirección Comercial.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Importar clientes en lote</h1>
        <p className="text-ink-muted text-sm">
          Sube un archivo CSV con varios clientes de un jalón. Si tienes un Excel, guárdalo primero
          como CSV (Archivo → Guardar como → CSV).
        </p>
      </div>

      {resultado && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          ✅ Se crearon {resultado.creados} de {resultado.total} clientes. Puedes subir otro archivo
          si te falta más gente.
        </div>
      )}

      {error && (
        <p className="text-sm bg-red-50 border border-red-300 text-red-800 rounded-md p-3">{error}</p>
      )}

      <div className="rounded-lg border border-line bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="bg-brand text-white rounded-md px-4 py-2 text-sm font-semibold cursor-pointer">
            Elegir archivo CSV
            <input type="file" accept=".csv" className="hidden" onChange={onArchivo} />
          </label>
          <button
            onClick={descargarPlantilla}
            className="text-sm px-4 py-2 rounded-md border border-line"
          >
            Descargar plantilla de ejemplo
          </button>
          {nombreArchivo && <span className="text-sm text-ink-muted">{nombreArchivo}</span>}
        </div>

        {encabezados.length > 0 && (
          <>
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-ink mb-2">
                Columnas detectadas — revisa que cada campo apunte a la columna correcta
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAMPOS.map((c) => (
                  <label key={c.campo} className="text-sm">
                    <span className="block text-ink-muted mb-1">
                      {c.label}
                      {c.requerido && " *"}
                    </span>
                    <select
                      className="input"
                      value={mapeo[c.campo] || ""}
                      onChange={(e) =>
                        setMapeo((m) => ({ ...m, [c.campo]: e.target.value }))
                      }
                    >
                      <option value="">— No importar —</option>
                      {encabezados.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-2 text-sm">
              <p>
                <strong>{filasPreparadas.length}</strong> filas en el archivo · {" "}
                <span className="text-green-700">{validas.length} listas para importar</span>
                {conError.length > 0 && (
                  <span className="text-red-700"> · {conError.length} con error (sin empresa)</span>
                )}
                {sinVendedorReconocido.length > 0 && (
                  <span className="text-yellow-700">
                    {" "}
                    · {sinVendedorReconocido.length} con vendedor no reconocido (quedan sin asignar)
                  </span>
                )}
              </p>

              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-section text-ink-muted text-left">
                    <tr>
                      <th className="p-2">Empresa</th>
                      <th className="p-2">RFC</th>
                      <th className="p-2">Vendedor</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasPreparadas.slice(0, 15).map((f, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{f.datos.empresa || "—"}</td>
                        <td className="p-2 text-ink-muted">{f.datos.rfc || "—"}</td>
                        <td className="p-2">
                          {f.vendedorTexto ? (
                            f.vendedorReconocido ? (
                              f.vendedorTexto
                            ) : (
                              <span className="text-yellow-700">{f.vendedorTexto} (no reconocido)</span>
                            )
                          ) : (
                            <span className="text-gray-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="p-2">{f.datos.tipo_cliente}</td>
                        <td className="p-2">
                          {f.error ? (
                            <span className="text-red-700">{f.error}</span>
                          ) : (
                            <span className="text-green-700">✓ lista</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasPreparadas.length > 15 && (
                  <p className="text-xs text-gray-400 p-2">
                    y {filasPreparadas.length - 15} filas más...
                  </p>
                )}
              </div>

              <button
                onClick={onImportar}
                disabled={importando || validas.length === 0}
                className="bg-brand text-white rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {importando ? "Importando..." : `Importar ${validas.length} clientes`}
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </main>
  );
}
