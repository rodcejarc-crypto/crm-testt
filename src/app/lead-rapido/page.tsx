"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buscarClientesSimilares,
  crearCliente,
  type ClienteSimilar,
} from "@/lib/data/clientes";
import { crearOportunidad } from "@/lib/data/oportunidades";
import { DuplicadosAviso } from "@/components/DuplicadosAviso";
import { PageHeader } from "@/components/PageHeader";
import { PIPELINES } from "@/lib/pipelines/config";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { PipelineKey } from "@/lib/types";

const PIPELINE_OPCIONES: { value: PipelineKey; label: string }[] = [
  { value: "ventas", label: PIPELINES.ventas.label },
  { value: "licitaciones", label: PIPELINES.licitaciones.label },
  { value: "recuperacion", label: PIPELINES.recuperacion.label },
];

export default function LeadRapidoPage() {
  const router = useRouter();
  const { vendedor, esAdmin } = useVendedorActual();
  const [empresa, setEmpresa] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [contacto, setContacto] = useState("");
  const [pipeline, setPipeline] = useState<PipelineKey>("ventas");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<ClienteSimilar[] | null>(null);
  const [ok, setOk] = useState(false);

  const listo = empresa.trim() && ciudad.trim() && contacto.trim() && pipeline;

  async function guardar(forzar: boolean) {
    setError(null);
    setGuardando(true);
    try {
      if (!forzar) {
        const similares = await buscarClientesSimilares(empresa);
        if (similares.length > 0) {
          setDuplicados(similares);
          setGuardando(false);
          return;
        }
      }
      const cliente = await crearCliente({
        empresa: empresa.trim(),
        ciudad: ciudad.trim(),
        contacto: contacto.trim(),
        tipo_cliente: "Nuevo",
        dueno_comercial_id: vendedor?.id ?? null,
      });
      await crearOportunidad({
        cliente_id: cliente.id,
        pipeline,
        dueno_comercial_id: vendedor?.id ?? null,
      });
      setDuplicados(null);
      setOk(true);
      setTimeout(() => router.push(`/clientes/${cliente.id}`), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listo) return;
    guardar(false);
  }

  if (ok) {
    return (
      <main className="max-w-md mx-auto p-6">
        <div className="rounded-lg border border-green-300 bg-green-50 p-6 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-semibold text-green-900">¡Lead guardado!</p>
          <p className="text-sm text-green-800">Abriendo la ficha del cliente…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-4 sm:p-6 space-y-4">
      <PageHeader titulo="Lead rápido" descripcion="Solo 4 datos. Lo demás se completa después." />

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block font-display text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">
            Empresa *
          </label>
          <input
            autoFocus
            className="w-full border border-line bg-card text-ink rounded-lg px-4 py-3 text-base focus:outline-none focus:border-brand"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Nombre de la empresa"
          />
        </div>

        <div>
          <label className="block font-display text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">
            Ciudad *
          </label>
          <input
            className="w-full border border-line bg-card text-ink rounded-lg px-4 py-3 text-base focus:outline-none focus:border-brand"
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="Ciudad"
          />
        </div>

        <div>
          <label className="block font-display text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">
            Contacto *
          </label>
          <input
            className="w-full border border-line bg-card text-ink rounded-lg px-4 py-3 text-base focus:outline-none focus:border-brand"
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            placeholder="Nombre de la persona"
          />
        </div>

        <div>
          <label className="block font-display text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">
            Pipeline *
          </label>
          <div className="grid grid-cols-1 gap-2">
            {PIPELINE_OPCIONES.map((op) => (
              <button
                type="button"
                key={op.value}
                onClick={() => setPipeline(op.value)}
                className={`text-left px-4 py-3 rounded-lg border text-base ${
                  pipeline === op.value
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-card text-ink-muted"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>

        {duplicados && duplicados.length > 0 && (
          <DuplicadosAviso
            duplicados={duplicados}
            puedesVerId={(d) => esAdmin || d.dueno_comercial_id === vendedor?.id}
            onCancelar={() => setDuplicados(null)}
            onConfirmar={() => guardar(true)}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!duplicados && (
          <button
            type="submit"
            disabled={!listo || guardando}
            className="w-full bg-brand text-white rounded-lg py-3.5 text-base font-semibold disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar lead"}
          </button>
        )}
      </form>
    </main>
  );
}
