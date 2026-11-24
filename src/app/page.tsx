import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(supabaseUrl && supabaseKey);

  let conectado = false;
  let esAdmin = false;
  let puedeVisitas = false;
  if (isConfigured) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("vendedores").select("id").limit(1);
      conectado = !error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: miVendedor } = await supabase
          .from("vendedores")
          .select("rol, hace_visitas_campo")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        esAdmin = miVendedor?.rol === "admin";
        puedeVisitas =
          miVendedor?.rol === "admin" ||
          miVendedor?.rol === "admin_unidad" ||
          miVendedor?.hace_visitas_campo === true;
      }
    } catch {
      conectado = false;
    }
  }

  const tarjetas = [
    {
      href: "/ventas",
      titulo: "Ventas",
      descripcion: "Bitácora automática de ventas cerradas, con filtros y totales.",
      color: "bg-teal-50 border-teal-200",
    },
    {
      href: "/seguimientos",
      titulo: "Seguimientos",
      descripcion: "Recordatorios, fechas límite y check-ins de hoy y atrasados.",
      color: "bg-red-50 border-red-200",
    },
    {
      href: "/lead-rapido",
      titulo: "Lead rápido",
      descripcion: "Captura un cliente nuevo en menos de 30 segundos, ideal desde el celular.",
      color: "bg-orange-50 border-orange-200",
    },
    {
      href: "/clientes",
      titulo: "Clientes",
      descripcion: "Busca clientes existentes por empresa, ciudad o RFC.",
      color: "bg-blue-50 border-blue-200",
    },
    {
      href: "/pipelines",
      titulo: "Pipelines",
      descripcion: "Tableros Kanban de Ventas, Licitaciones y Recuperación de cartera.",
      color: "bg-green-50 border-green-200",
    },
    ...(puedeVisitas
      ? [
          {
            href: "/visitas",
            titulo: "Visitas",
            descripcion: "Agenda y evidencia de visitas a clientes.",
            color: "bg-pink-50 border-pink-200",
          },
        ]
      : []),
    ...(esAdmin
      ? [
          {
            href: "/dashboard",
            titulo: "Dashboard ejecutivo",
            descripcion: "Conversión, cumplimiento de metas, estancadas y ranking del equipo.",
            color: "bg-indigo-50 border-indigo-200",
          },
          {
            href: "/metas",
            titulo: "Metas y Comisiones",
            descripcion: "Meta total y piso de Piel por vendedor/unidad, tarifas y aceleradores.",
            color: "bg-yellow-50 border-yellow-200",
          },
          {
            href: "/vendedores",
            titulo: "Vendedores",
            descripcion: "Administra la lista de dueños comerciales.",
            color: "bg-purple-50 border-purple-200",
          },
        ]
      : []),
  ];

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink">CRM Rhinoboots</h1>
          <p className="text-ink-muted">Ventas, licitaciones y recuperación de cartera en un solo lugar.</p>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full border ${
            conectado
              ? "bg-green-100 text-green-800 border-green-300"
              : "bg-red-100 text-red-800 border-red-300"
          }`}
        >
          {conectado ? "Base de datos conectada" : "Sin conexión a la base de datos"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tarjetas.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg border p-5 hover:shadow-md transition-shadow ${t.color}`}
          >
            <h2 className="font-semibold text-ink mb-1">{t.titulo}</h2>
            <p className="text-sm text-ink-muted">{t.descripcion}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
