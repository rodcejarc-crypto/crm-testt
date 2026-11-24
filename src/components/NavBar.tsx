"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { comentariosSinLeer } from "@/lib/data/comentarios";
import { useVendedorActual } from "@/lib/hooks/useVendedorActual";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const { esAdmin, esAdminUnidad, puedeVisitas } = useVendedorActual();
  const [sinLeer, setSinLeer] = useState(0);

  // Comentarios de gerencia que el vendedor todavía no ha leído. Se vuelve a
  // consultar al cambiar de pantalla y cuando se lee una oportunidad.
  useEffect(() => {
    let activo = true;
    const cargar = () =>
      comentariosSinLeer()
        .then((r) => {
          if (activo) setSinLeer(r.length);
        })
        .catch(() => {
          if (activo) setSinLeer(0);
        });
    cargar();
    window.addEventListener("comentarios-actualizados", cargar);
    return () => {
      activo = false;
      window.removeEventListener("comentarios-actualizados", cargar);
    };
  }, [pathname, email]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (pathname === "/login" || pathname === "/reset-password") return null;

  const links = [
    { href: "/", label: "Inicio" },
    { href: "/ventas", label: "Ventas" },
    { href: "/seguimientos", label: "Seguimientos" },
    { href: "/llamadas", label: "Llamadas" },
    { href: "/clientes", label: "Clientes" },
    { href: "/pipelines", label: "Pipelines" },
    { href: "/muestras", label: "Muestras" },
    { href: "/lead-rapido", label: "Lead rápido" },
    ...(puedeVisitas ? [{ href: "/visitas", label: "Visitas" }] : []),
    // "/comisiones" está en pausa (ver AGENTS/CLAUDE notas del proyecto) —
    // no se muestra en el menú mientras el motor de comisiones no se
    // retome. La ruta sigue existiendo y muestra un aviso, no se borró.
    ...(esAdmin || esAdminUnidad
      ? [
          { href: "/dashboard", label: "Dashboard" },
          // Metas (fijar objetivos) sigue siendo solo de la administración
          // general; un administrador de unidad no la ve.
          ...(esAdmin ? [{ href: "/metas", label: "Metas" }] : []),
          { href: "/vendedores", label: "Vendedores" },
          ...(esAdmin ? [{ href: "/depuracion", label: "Depuración" }] : []),
        ]
      : []),
  ];

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-card sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 gap-2">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <Image
            src="/rhino-logo-header.png"
            alt="Rhinoboots"
            width={700}
            height={240}
            priority
            className="h-8 w-auto"
          />
          <span className="font-display text-xs font-semibold text-ink-muted hidden sm:inline">
            CRM
          </span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto font-display">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm whitespace-nowrap ${
                  active
                    ? "bg-brand text-white"
                    : "text-ink-muted hover:bg-section"
                }`}
              >
                {link.label}
                {link.href === "/seguimientos" && sinLeer > 0 && (
                  <span
                    title="Comentarios de gerencia sin leer"
                    className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ink text-card text-[10px] font-num font-semibold"
                  >
                    💬 {sinLeer}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {email && (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Link
              href="/cuenta"
              className="text-xs text-ink-muted hidden sm:inline hover:underline"
            >
              {email}
            </Link>
            <button
              onClick={salir}
              className="text-xs px-2 py-1.5 rounded-md border border-line text-ink-muted hover:bg-section"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
