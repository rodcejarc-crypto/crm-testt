"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatoMoneda } from "@/lib/pipelines/config";
import type { VentaCerrada } from "@/lib/types";

/**
 * Ventas directas del mes: el cliente ya hizo su pedido, no pasó por el embudo.
 * Cuentan para ventas y metas, pero no para las conversiones del embudo.
 */
export function BloqueVentasDirectas({
  ventasCerradas,
  anioMes,
}: {
  ventasCerradas: VentaCerrada[];
  anioMes: string;
}) {
  const [ids, setIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    createClient()
      .from("oportunidades")
      .select("id")
      .eq("origen", "venta_directa")
      .then(({ data }) => setIds(new Set((data ?? []).map((o) => o.id as string))));
  }, []);

  if (!ids) return null;

  const delMes = ventasCerradas.filter((v) => v.fecha_cierre.slice(0, 7) === anioMes && v.pipeline === "ventas");
  const directas = delMes.filter((v) => ids.has(v.oportunidad_id));
  const deEmbudo = delMes.length - directas.length;
  const monto = directas.reduce((s, v) => s + Number(v.total_facturado || 0), 0);
  const pares = directas.reduce((s, v) => s + Number(v.pares_vendidos || 0), 0);

  const porVendedor = new Map<string, number>();
  for (const v of directas) {
    const n = v.vendedor_nombre || "—";
    porVendedor.set(n, (porVendedor.get(n) ?? 0) + 1);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-ink">Ventas directas vs. embudo (este mes)</h2>
      <p className="text-sm text-ink-muted">
        Las ventas directas son clientes que ya hicieron su pedido: cuentan para ventas y metas, pero no
        para las conversiones del embudo, que miden solo prospección y cotización.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Tarjeta titulo="Ventas directas" valor={String(directas.length)} />
        <Tarjeta titulo="Cerradas desde el embudo" valor={String(deEmbudo)} />
        <Tarjeta titulo="Pares (directas)" valor={String(pares)} />
        <Tarjeta titulo="Facturación (directas)" valor={formatoMoneda(monto)} />
      </div>
      {porVendedor.size > 0 && (
        <p className="text-xs text-ink-muted">
          Por vendedor:{" "}
          {[...porVendedor.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([n, c]) => `${n} (${c})`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="text-sm text-ink-muted">{titulo}</p>
      <p className="font-num text-2xl font-bold text-brand">{valor}</p>
    </div>
  );
}
