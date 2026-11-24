"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { actualizarCliente, obtenerCliente } from "@/lib/data/clientes";
import {
  crearOportunidad,
  listarOportunidadesPorCliente,
} from "@/lib/data/oportunidades";
import { formatoMoneda, PIPELINES } from "@/lib/pipelines/config";
import { GrupoCliente } from "@/components/GrupoCliente";
import { ComisionistaCliente } from "@/components/ComisionistaCliente";
import { CategoriaCliente } from "@/components/CategoriaCliente";
import { DescartarCliente } from "@/components/DescartarCliente";
import { RegistrarVentaDirecta } from "@/components/RegistrarVentaDirecta";
import { ReactivarModal } from "@/components/ReactivarModal";
import { LineaDeTiempo } from "@/components/LineaDeTiempo";
import { etiquetaOrigen } from "@/lib/origen-cliente";
import { ReasignarCliente } from "@/components/ReasignarCliente";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { Cliente, NivelCuenta, Oportunidad, PipelineKey, TipoCliente } from "@/lib/types";

const ESTADO_COLOR: Record<string, string> = {
  abierta: "bg-blue-100 text-blue-800",
  ganada: "bg-green-100 text-green-800",
  perdida: "bg-red-100 text-red-800",
  cliente_activo: "bg-emerald-100 text-emerald-800",
};

const ESTADO_TEXTO: Record<string, string> = { cliente_activo: "cliente activo" };

interface FormEdicion {
  empresa: string;
  contacto: string;
  telefono: string;
  email: string;
  redes_sociales: string;
  direccion: string;
  ciudad: string;
  estado: string;
  rfc: string;
  cuenta_clave: string;
  tipo_cliente: TipoCliente;
  nivel_cuenta: NivelCuenta;
}

function formDesdeCliente(c: Cliente): FormEdicion {
  return {
    empresa: c.empresa,
    contacto: c.contacto || "",
    telefono: c.telefono || "",
    email: c.email || "",
    redes_sociales: c.redes_sociales || "",
    direccion: c.direccion || "",
    ciudad: c.ciudad || "",
    estado: c.estado || "",
    rfc: c.rfc || "",
    cuenta_clave: c.cuenta_clave || "",
    tipo_cliente: c.tipo_cliente,
    nivel_cuenta: c.nivel_cuenta,
  };
}

export default function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = usePromise(params);
  const { esAdmin, esAdminUnidad } = useVendedorActual();
  const puedeReasignar = esAdmin || esAdminUnidad;
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoPipeline, setNuevoPipeline] = useState<PipelineKey>("ventas");
  const [creando, setCreando] = useState(false);
  const [mostrarReactivar, setMostrarReactivar] = useState(false);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormEdicion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const [c, ops] = await Promise.all([
      obtenerCliente(id),
      listarOportunidadesPorCliente(id),
    ]);
    setCliente(c);
    setOportunidades(ops);
    setCargando(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function onEditar() {
    if (!cliente) return;
    setForm(formDesdeCliente(cliente));
    setError(null);
    setEditando(true);
  }

  async function onGuardar() {
    if (!cliente || !form) return;
    if (!form.empresa.trim()) {
      setError("El nombre del cliente no puede quedar vacío.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const actualizado = await actualizarCliente(cliente.id, {
        empresa: form.empresa.trim(),
        contacto: form.contacto.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        redes_sociales: form.redes_sociales.trim() || null,
        direccion: form.direccion.trim() || null,
        ciudad: form.ciudad.trim() || null,
        estado: form.estado.trim() || null,
        rfc: form.rfc.trim() || null,
        cuenta_clave: form.cuenta_clave.trim() || null,
        tipo_cliente: form.tipo_cliente,
        nivel_cuenta: form.nivel_cuenta,
      });
      setCliente(actualizado);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const oportunidadRecuperacion = oportunidades.find(
    (o) => o.pipeline === "recuperacion" && o.estado_cierre === "abierta"
  );

  async function crearNuevaOportunidad() {
    if (!cliente) return;
    setCreando(true);
    try {
      await crearOportunidad({
        cliente_id: cliente.id,
        pipeline: nuevoPipeline,
        dueno_comercial_id: cliente.dueno_comercial_id,
      });
      await cargar();
    } finally {
      setCreando(false);
    }
  }

  if (cargando) {
    return <main className="max-w-4xl mx-auto p-6">Cargando...</main>;
  }

  if (!cliente) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <p className="text-ink-muted">No se encontró este cliente.</p>
        <Link href="/clientes" className="text-brand underline text-sm">
          Volver a clientes
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-brand underline">
          ← Clientes
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-2 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-ink">{cliente.empresa}</h1>
            <p className="text-ink-muted text-sm">
              Dueño comercial: <strong>{cliente.dueno?.nombre || "Sin asignar"}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cliente.descartado && (
              <span className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-300">
                Descartado
              </span>
            )}
            <span className="text-xs px-3 py-1 rounded-full bg-section border border-line">
              {cliente.categoria_cliente ? `${cliente.categoria_cliente} · ` : ""}
              {cliente.tipo_cliente} · {cliente.nivel_cuenta}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-line rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Datos de contacto</p>
          {!editando && (
            <button
              onClick={onEditar}
              className="text-sm px-3 py-1.5 rounded-md border border-line"
            >
              Editar
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {editando && form ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <CampoEdicion
                label="Nombre del cliente / razón social"
                valor={form.empresa}
                onChange={(v) => setForm({ ...form, empresa: v })}
              />
              <CampoEdicion label="Contacto" valor={form.contacto} onChange={(v) => setForm({ ...form, contacto: v })} />
              <CampoEdicion label="Teléfono" valor={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
              <CampoEdicion label="Correo" valor={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <CampoEdicion
                label="Redes sociales"
                valor={form.redes_sociales}
                onChange={(v) => setForm({ ...form, redes_sociales: v })}
              />
              <CampoEdicion label="Dirección" valor={form.direccion} onChange={(v) => setForm({ ...form, direccion: v })} />
              <CampoEdicion label="Ciudad" valor={form.ciudad} onChange={(v) => setForm({ ...form, ciudad: v })} />
              <CampoEdicion label="Estado" valor={form.estado} onChange={(v) => setForm({ ...form, estado: v })} />
              <CampoEdicion label="RFC" valor={form.rfc} onChange={(v) => setForm({ ...form, rfc: v })} />
              <CampoEdicion
                label="Cuenta clave"
                valor={form.cuenta_clave}
                onChange={(v) => setForm({ ...form, cuenta_clave: v })}
              />
              <label className="block">
                <span className="block text-ink-muted mb-1">Tipo de cliente</span>
                <select
                  className="input"
                  value={form.tipo_cliente}
                  onChange={(e) => setForm({ ...form, tipo_cliente: e.target.value as TipoCliente })}
                >
                  <option value="Nuevo">Nuevo</option>
                  <option value="Cartera">Cartera</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-ink-muted mb-1">Nivel de cuenta</span>
                <select
                  className="input"
                  value={form.nivel_cuenta}
                  onChange={(e) => setForm({ ...form, nivel_cuenta: e.target.value as NivelCuenta })}
                >
                  <option value="Estratégica">Estratégica</option>
                  <option value="Crecimiento">Crecimiento</option>
                  <option value="Estándar">Estándar</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onGuardar}
                disabled={guardando}
                className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                onClick={() => setEditando(false)}
                disabled={guardando}
                className="text-sm px-4 py-2 rounded-md border border-line"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Dato label="Contacto" valor={cliente.contacto} />
            <Dato label="Teléfono" valor={cliente.telefono} />
            <Dato label="Correo" valor={cliente.email} />
            <Dato label="Redes sociales" valor={cliente.redes_sociales} />
            <Dato label="Dirección" valor={cliente.direccion} />
            <Dato label="Ciudad" valor={cliente.ciudad} />
            <Dato label="Estado" valor={cliente.estado} />
            <Dato label="RFC" valor={cliente.rfc} />
            <Dato label="Cuenta clave" valor={cliente.cuenta_clave} />
            <Dato label="ID externo" valor={cliente.id_externo || "— (pendiente)"} />
            {etiquetaOrigen(cliente.origen) && <Dato label="Origen" valor={etiquetaOrigen(cliente.origen)} />}
          </div>
        )}
        {!editando && cliente.observaciones && (
          <div className="rounded-md bg-section p-3 text-sm">
            <p className="text-xs font-semibold text-ink-muted mb-1">Observaciones</p>
            <p className="text-ink whitespace-pre-line">{cliente.observaciones}</p>
          </div>
        )}
      </div>

      {puedeReasignar && (
        <ReasignarCliente
          clienteId={cliente.id}
          duenoActualId={cliente.dueno_comercial_id}
          duenoActualNombre={cliente.dueno?.nombre ?? null}
          onCambio={cargar}
        />
      )}

      <CategoriaCliente
        clienteId={cliente.id}
        categoria={cliente.categoria_cliente}
        onCambio={cargar}
      />

      <GrupoCliente clienteId={cliente.id} grupoId={cliente.grupo_id} onCambio={cargar} />

      <ComisionistaCliente
        clienteId={cliente.id}
        comisionista={cliente.comisionista}
        onCambio={cargar}
      />

      <DescartarCliente
        clienteId={cliente.id}
        empresa={cliente.empresa}
        descartado={cliente.descartado}
        motivoDescarte={cliente.motivo_descarte}
        descartadoEn={cliente.descartado_en}
        descartadoPorNombre={cliente.descartado_por_vendedor?.nombre ?? null}
        onCambio={cargar}
      />

      <div className="bg-card border border-line rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-ink">Nueva oportunidad</h2>
            <p className="text-xs text-ink-muted">
              Para clientes nuevos o que necesitan cotización. Si ya te hizo un pedido, usa &quot;Registrar venta&quot;.
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <RegistrarVentaDirecta
              clienteInicial={{ id: cliente.id, empresa: cliente.empresa, dueno_comercial_id: cliente.dueno_comercial_id }}
              className="border border-brand text-brand bg-card rounded-md px-4 py-1.5 text-sm whitespace-nowrap"
            />
            <select
              className="border rounded-md px-3 py-1.5 text-sm"
              value={nuevoPipeline}
              onChange={(e) => setNuevoPipeline(e.target.value as PipelineKey)}
            >
              {(Object.keys(PIPELINES) as PipelineKey[]).map((p) => (
                <option key={p} value={p}>
                  {PIPELINES[p].label}
                </option>
              ))}
            </select>
            <button
              onClick={crearNuevaOportunidad}
              disabled={creando}
              className="bg-brand text-white rounded-md px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {creando ? "Creando..." : "Crear"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {oportunidadRecuperacion && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-yellow-900">
              Este cliente está en la lista de <strong>Recuperación</strong>. Si ya volvió a comprar,
              reactívalo: pasa a cliente activo y se crea su oportunidad en Ventas, sin perder el historial.
            </p>
            <button
              onClick={() => setMostrarReactivar(true)}
              className="text-sm px-4 py-1.5 rounded-md bg-green-600 text-white"
            >
              Reactivar cliente
            </button>
          </div>
        )}
        <h2 className="font-semibold text-ink">
          Oportunidades ({oportunidades.length})
        </h2>
        {oportunidades.length === 0 ? (
          <p className="text-sm text-ink-muted">Este cliente todavía no tiene oportunidades.</p>
        ) : (
          <div className="grid gap-3">
            {oportunidades.map((o) => (
              <Link
                key={o.id}
                href={`/oportunidades/${o.id}`}
                className="bg-card border border-line rounded-lg p-4 flex items-center justify-between hover:shadow-sm"
              >
                <div>
                  <p className="font-medium text-ink">
                    {PIPELINES[o.pipeline].label} — {o.etapa}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {formatoMoneda(o.valor_estimado ?? o.monto_estimado)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${ESTADO_COLOR[o.estado_cierre]}`}
                >
                  {ESTADO_TEXTO[o.estado_cierre] ?? o.estado_cierre}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-line rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-ink">Línea de tiempo del cliente</h2>
        <p className="text-xs text-ink-muted">
          Todo lo que ha pasado con este cliente en Ventas, Licitaciones y Recuperación (lo más reciente
          arriba).
        </p>
        <LineaDeTiempo
          clienteId={cliente.id}
          masRecienteArriba
          oportunidades={oportunidades.map((o) => ({
            id: o.id,
            created_at: o.created_at,
            etiqueta: `${PIPELINES[o.pipeline].label} — ${o.etapa}`,
          }))}
        />
      </div>

      {mostrarReactivar && oportunidadRecuperacion && (
        <ReactivarModal
          oportunidadId={oportunidadRecuperacion.id}
          empresa={cliente.empresa}
          onCancel={() => setMostrarReactivar(false)}
        />
      )}

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

function Dato({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-ink-muted">{label}</p>
      <p className="text-ink font-medium">{valor || "—"}</p>
    </div>
  );
}

function CampoEdicion({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-ink-muted mb-1">{label}</span>
      <input className="input" value={valor} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
