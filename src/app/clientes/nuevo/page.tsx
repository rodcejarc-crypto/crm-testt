"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buscarClientesSimilares,
  crearCliente,
  type ClienteSimilar,
} from "@/lib/data/clientes";
import { listarVendedores } from "@/lib/data/vendedores";
import { DuplicadosAviso } from "@/components/DuplicadosAviso";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";
import type { NivelCuenta, TipoCliente, Vendedor } from "@/lib/types";

export default function ClienteNuevoPage() {
  const router = useRouter();
  const { vendedor, esAdmin } = useVendedorActual();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  const [empresa, setEmpresa] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [redesSociales, setRedesSociales] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [estado, setEstado] = useState("");
  const [rfc, setRfc] = useState("");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("Nuevo");
  const [cuentaClave, setCuentaClave] = useState("");
  const [duenoId, setDuenoId] = useState("");
  const [nivelCuenta, setNivelCuenta] = useState<NivelCuenta>("Estándar");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<ClienteSimilar[] | null>(null);

  useEffect(() => {
    listarVendedores().then(setVendedores).catch(() => {});
  }, []);

  useEffect(() => {
    if (vendedor && !esAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDuenoId(vendedor.id);
    }
  }, [vendedor, esAdmin]);

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
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        redes_sociales: redesSociales.trim() || null,
        direccion: direccion.trim() || null,
        ciudad: ciudad.trim() || null,
        estado: estado.trim() || null,
        rfc: rfc.trim() || null,
        tipo_cliente: tipoCliente,
        cuenta_clave: cuentaClave.trim() || null,
        dueno_comercial_id: duenoId || null,
        nivel_cuenta: nivelCuenta,
      });
      router.push(`/clientes/${cliente.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empresa.trim()) return;
    guardar(false);
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Nuevo cliente</h1>
        <p className="text-ink-muted text-sm">
          Ficha completa. Si solo necesitas capturar un lead rápido en campo,
          usa <a href="/lead-rapido" className="underline">Lead rápido</a>.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 bg-card border border-line rounded-lg p-5">
        <Campo label="Empresa *">
          <input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
        </Campo>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Contacto">
            <input className="input" value={contacto} onChange={(e) => setContacto(e.target.value)} />
          </Campo>
          <Campo label="Teléfono">
            <input className="input" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Campo>
          <Campo label="Correo electrónico">
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>
          <Campo label="Redes sociales">
            <input
              className="input"
              placeholder="Ej. Facebook: /aceites-especiales · Instagram: @aceitesesp"
              value={redesSociales}
              onChange={(e) => setRedesSociales(e.target.value)}
            />
          </Campo>
          <Campo label="Dirección">
            <input
              className="input"
              placeholder="Calle, número, colonia"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
          </Campo>
          <Campo label="Ciudad">
            <input className="input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          </Campo>
          <Campo label="Estado">
            <input className="input" value={estado} onChange={(e) => setEstado(e.target.value)} />
          </Campo>
          <Campo label="RFC">
            <input className="input" value={rfc} onChange={(e) => setRfc(e.target.value)} />
          </Campo>
          <Campo label="Cuenta clave (grupo corporativo)">
            <input
              className="input"
              value={cuentaClave}
              onChange={(e) => setCuentaClave(e.target.value)}
              placeholder="Ej. Grupo Modelo"
            />
          </Campo>
          <Campo label="Tipo de cliente">
            <select className="input" value={tipoCliente} onChange={(e) => setTipoCliente(e.target.value as TipoCliente)}>
              <option value="Nuevo">Nuevo</option>
              <option value="Cartera">Cartera</option>
            </select>
          </Campo>
          <Campo label="Nivel de cuenta">
            <select className="input" value={nivelCuenta} onChange={(e) => setNivelCuenta(e.target.value as NivelCuenta)}>
              <option value="Estratégica">Estratégica</option>
              <option value="Crecimiento">Crecimiento</option>
              <option value="Estándar">Estándar</option>
            </select>
          </Campo>
          <Campo label="Dueño comercial">
            {esAdmin ? (
              <select className="input" value={duenoId} onChange={(e) => setDuenoId(e.target.value)}>
                <option value="">Sin asignar</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input bg-section text-ink-muted" value={vendedor?.nombre || ""} disabled />
            )}
          </Campo>
          <Campo label="ID externo (facturación)">
            <input
              className="input bg-section text-gray-400"
              value=""
              disabled
              placeholder="Se conectará más adelante"
            />
          </Campo>
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
            disabled={!empresa.trim() || guardando}
            className="bg-brand text-white rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Crear cliente"}
          </button>
        )}
      </form>

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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
