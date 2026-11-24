"use client";

import { useEffect, useState } from "react";
import { obtenerDatosMes } from "@/lib/data/comisiones";
import { calcularComisionesMes, type DesgloseComision } from "@/lib/comisiones";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import { formatoMoneda } from "@/lib/pipelines/config";

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Rubro({ label, valor }: { label: string; valor: number }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{formatoMoneda(valor)}</span>
    </div>
  );
}

function TarjetaComision({ fila }: { fila: DesgloseComision }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="font-semibold text-ink">
            {fila.nombre}
            {fila.etiqueta && <span className="text-gray-400 font-normal"> — {fila.etiqueta}</span>}
          </p>
          {!fila.esUnidad && (
            <p className="text-xs text-ink-muted">
              {fila.pielPares.toLocaleString("es-MX")} / {fila.pisoPiel.toLocaleString("es-MX")} pares de
              Piel
              {fila.cumplimientoPct !== null && ` · ${fila.cumplimientoPct.toFixed(1)}% del piso`}
              {" · "}
              {fila.llave ? "✅ llegó a la llave" : "❌ no llegó a la llave"}
            </p>
          )}
        </div>
        <p className="text-xl font-bold text-brand">{formatoMoneda(fila.total)}</p>
      </div>

      {!fila.esUnidad && fila.visitasRequeridas !== null && (
        <p className="text-xs text-ink-muted">
          Visitas: {fila.visitasRealizadas}/{fila.visitasRequeridas}{" "}
          {fila.condicionVisitasCumplida ? "✅ cumplida" : "❌ no cumplida"}
          {!fila.condicionVisitasCumplida && " (por eso no califica para el acelerador)"}
        </p>
      )}

      <div className="border-t pt-2 space-y-1">
        <Rubro label="Calzado de Piel" valor={fila.comisionPiel} />
        <Rubro label="PVC" valor={fila.comisionPvc} />
        <Rubro label="Calzado Económico" valor={fila.comisionEconomico} />
        <Rubro label={`Clientes Recuperados (${fila.recuperadoPares} pares a $4)`} valor={fila.comisionRecuperados} />
        <Rubro label="Acelerador" valor={fila.aceleradorBono} />
        <Rubro label="Bono de tienda" valor={fila.bonoTienda} />
        <Rubro label="Bono de sucursal" valor={fila.bonoSucursal} />
        {fila.total === 0 && (
          <p className="text-sm text-gray-400">Sin comisión este mes.</p>
        )}
      </div>

      {fila.advertencias.length > 0 && (
        <div className="border-t pt-2 space-y-1">
          {fila.advertencias.map((a, i) => (
            <p key={i} className="text-xs text-yellow-700">
              ⚠ {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// El motor de comisiones está en pausa mientras se termina el CRM base
// (dashboard ejecutivo + informe mensual de Fase 4). Todo el cálculo real
// sigue abajo tal cual, sin tocar — solo se deja de renderizar. Para
// reactivarlo, cambia PAUSADO a false.
const PAUSADO = true;

export default function ComisionesPage() {
  if (PAUSADO) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <div className="rounded-lg border border-line bg-card p-6 text-center space-y-2">
          <p className="text-2xl">⏸️</p>
          <h1 className="text-lg font-semibold text-ink">Comisiones — en pausa</h1>
          <p className="text-sm text-ink-muted">
            Esta sección está guardada pero pausada mientras terminamos el resto del CRM. La
            retomaremos más adelante.
          </p>
        </div>
      </main>
    );
  }
  return <ComisionesPageReal />;
}

function ComisionesPageReal() {
  const { vendedor, esAdmin, cargando: cargandoRol } = useVendedorActual();
  const [anioMes, setAnioMes] = useState(mesActual());
  const [cargando, setCargando] = useState(true);
  const [filas, setFilas] = useState<DesgloseComision[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const datos = await obtenerDatosMes(anioMes);
        setFilas(calcularComisionesMes(datos));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al calcular comisiones");
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [anioMes]);

  if (cargandoRol) return <main className="max-w-4xl mx-auto p-6">Cargando...</main>;

  const filasVisibles = esAdmin
    ? filas
    : filas.filter((f) => f.vendedorId === vendedor?.id);

  const totalGeneral = filasVisibles.reduce((s, f) => s + f.total, 0);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">Comisiones</h1>
          <p className="text-ink-muted text-sm">
            {esAdmin
              ? "Desglose de comisiones de todo el equipo."
              : "Tu desglose de comisiones del mes."}
          </p>
        </div>
        <input
          type="month"
          className="border rounded-md px-3 py-2 text-sm"
          value={anioMes}
          onChange={(e) => setAnioMes(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm bg-red-50 border border-red-300 text-red-800 rounded-md p-3">{error}</p>
      )}

      {cargando ? (
        <p className="text-sm text-ink-muted">Calculando...</p>
      ) : filasVisibles.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No hay metas capturadas para {anioMes} — captúralas en{" "}
          <a href="/metas" className="underline">
            Metas y Comisiones
          </a>
          .
        </p>
      ) : (
        <>
          {esAdmin && (
            <div className="rounded-lg border border-line bg-section p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-ink-muted">Total del mes</span>
              <span className="text-xl font-bold text-brand">{formatoMoneda(totalGeneral)}</span>
            </div>
          )}
          <div className="space-y-4">
            {filasVisibles.map((f) => (
              <TarjetaComision key={f.contextoKey} fila={f} />
            ))}
          </div>
        </>
      )}

      <p className="text-xs text-gray-400">
        Solo se cuentan ventas ya cobradas ese mes; las cancelaciones se descuentan en el mes en que
        se registraron.
      </p>
    </main>
  );
}
