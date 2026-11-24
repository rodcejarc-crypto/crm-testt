"use server";

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generarPassword(): string {
  const alfabeto =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return out;
}

export async function crearVendedorConAcceso(
  nombre: string,
  email: string,
  rol: "vendedor" | "admin_unidad" = "vendedor",
  unidadNegocio?: string
) {
  // Verifica que quien llama esta acción ya inició sesión y es admin.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Debes iniciar sesión para hacer esto.");
  }

  const { data: vendedorActual } = await supabase
    .from("vendedores")
    .select("rol")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (vendedorActual?.rol !== "admin") {
    throw new Error("Solo un administrador puede crear cuentas de vendedores.");
  }

  const admin = createAdminClient();
  const password = generarPassword();

  const { data: nuevoUsuario, error: errorAuth } =
    await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });

  if (errorAuth) {
    if (errorAuth.message.toLowerCase().includes("already been registered")) {
      throw new Error("Ya existe una cuenta con ese correo.");
    }
    throw new Error(errorAuth.message);
  }

  const { error: errorVendedor } = await admin.from("vendedores").insert({
    nombre: nombre.trim(),
    email: email.trim(),
    auth_user_id: nuevoUsuario.user.id,
    rol,
    unidad_negocio: rol === "admin_unidad" ? (unidadNegocio || "").trim() || null : null,
  });

  if (errorVendedor) {
    // Si falla guardar el vendedor, no dejamos huérfana la cuenta de acceso.
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    throw new Error(errorVendedor.message);
  }

  return { password };
}
