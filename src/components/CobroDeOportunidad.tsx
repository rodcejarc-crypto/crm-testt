"use client";

import { useEffect, useState } from "react";
import { obtenerVentaPorOportunidad } from "@/lib/data/ventas";
import { CobroVenta } from "@/components/CobroVenta";
import { formatoMoneda } from "@/lib/pipelines/config";
import type { VentaCerrada } from "@/lib/types";

/** En una oportunidad ya ganada: cuánto se facturó y si ya se cobró (editable aquí mismo). */
export function CobroDeOportunidad({ oportunidadId }: { oportunidadId: string }) {
  const [venta, setVenta] = useState<VentaCerrada | null>(null);

  useEffect(() => {
    let activo = true;
    obtenerVentaPorOportunidad(oportunidadId)
      .then((v) => activo && setVenta(v))
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [oportunidadId]);

  if (!venta) return null;

  return (
    <div className="bg-card border border-line rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-ink">Cobranza de la factura</p>
        <p className="text-xs text-ink-muted">
          Total facturado: <strong className="font-num text-ink">{formatoMoneda(venta.total_facturado)}</strong>
          {venta.factura ? ` · Factura ${venta.factura}` : ""}
        </p>
      </div>
      <CobroVenta
        ventaId={venta.id}
        estado={venta.estado_cobro}
        fechaCobro={venta.fecha_cobro}
        onCambio={(estado, fecha) => setVenta({ ...venta, estado_cobro: estado, fecha_cobro: fecha })}
      />
    </div>
  );
}
