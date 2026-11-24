"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { obtenerVendedorActual } from "@/lib/data/vendedores";
import { unidadDe, type UnidadNegocio } from "@/lib/unidades";
import type { Vendedor } from "@/lib/types";

/**
 * Vendedor (con su rol) que corresponde a la sesión actual. Se vuelve a
 * consultar cada vez que la sesión cambia (iniciar/cerrar sesión): la barra
 * de navegación vive en todas las pantallas y NO se recarga al iniciar
 * sesión, así que sin esto no se enteraba de que entró un admin y el menú
 * (Dashboard, Metas, Vendedores) seguía oculto hasta refrescar.
 *
 * `esAdmin` es SOLO el administrador general (ve toda la empresa).
 * `esAdminUnidad` es el "administrador de unidad" (ver AGENTS/CLAUDE): ve y
 * opera igual que un admin, pero limitado a `miUnidad`. La base de datos
 * (RLS) ya hace cumplir ese límite aunque la pantalla se equivoque, así que
 * esto solo decide qué botones/pantallas mostrar.
 */
export function useVendedorActual() {
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    const cargar = () =>
      obtenerVendedorActual()
        .then((v) => {
          if (activo) setVendedor(v);
        })
        .catch(() => {
          if (activo) setVendedor(null);
        })
        .finally(() => {
          if (activo) setCargando(false);
        });

    cargar();
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
        // Se difiere para no hacer consultas dentro del propio callback de auth.
        setTimeout(cargar, 0);
      }
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const miUnidad: UnidadNegocio | null =
    vendedor?.rol === "admin_unidad" ? unidadDe(vendedor.unidad_negocio) : null;

  return {
    vendedor,
    cargando,
    esAdmin: vendedor?.rol === "admin",
    esAdminUnidad: vendedor?.rol === "admin_unidad",
    miUnidad,
    // Visitas: la administración (general o de unidad) y los vendedores de campo.
    puedeVisitas:
      vendedor?.rol === "admin" ||
      vendedor?.rol === "admin_unidad" ||
      vendedor?.hace_visitas_campo === true,
  };
}
