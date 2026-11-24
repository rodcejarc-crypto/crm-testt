"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Recuperar contraseña
  const [mostrarRecuperar, setMostrarRecuperar] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState("");
  const [enviandoRecuperar, setEnviandoRecuperar] = useState(false);
  const [mensajeRecuperar, setMensajeRecuperar] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setCargando(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : error.message
      );
      return;
    }
    const next = searchParams.get("next") || "/";
    router.push(next);
    router.refresh();
  }

  async function onSubmitRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoRecuperar(true);
    setMensajeRecuperar(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      emailRecuperar.trim(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );
    setEnviandoRecuperar(false);
    // Por seguridad mostramos el mismo mensaje exista o no esa cuenta.
    setMensajeRecuperar(
      error
        ? "No se pudo enviar el correo. Intenta de nuevo en unos minutos."
        : "Si ese correo tiene una cuenta, te llegará un enlace para crear una nueva contraseña."
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-paper">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image
            src="/logo-rhino.png"
            alt="Rhino — The Tough One"
            width={320}
            height={104}
            priority
            className="mx-auto h-auto w-full max-w-[280px] mb-4"
          />
          <h1 className="text-xl font-bold text-ink">CRM Rhinoboots</h1>
          <p className="text-ink-muted text-sm">Inicia sesión para continuar</p>
        </div>

        {!mostrarRecuperar ? (
          <form
            onSubmit={onSubmit}
            className="bg-card border border-line rounded-lg p-6 space-y-4"
          >
            <label className="block">
              <span className="block text-sm font-medium text-ink-muted mb-1">
                Correo
              </span>
              <input
                type="email"
                required
                autoFocus
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink-muted mb-1">
                Contraseña
              </span>
              <input
                type="password"
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-brand text-white rounded-md py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {cargando ? "Entrando..." : "Entrar"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMostrarRecuperar(true);
                setEmailRecuperar(email);
              }}
              className="w-full text-center text-xs text-ink-muted underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        ) : (
          <form
            onSubmit={onSubmitRecuperar}
            className="bg-card border border-line rounded-lg p-6 space-y-4"
          >
            <p className="text-sm text-ink-muted">
              Escribe tu correo y te enviamos un enlace para crear una
              contraseña nueva.
            </p>
            <label className="block">
              <span className="block text-sm font-medium text-ink-muted mb-1">
                Correo
              </span>
              <input
                type="email"
                required
                autoFocus
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={emailRecuperar}
                onChange={(e) => setEmailRecuperar(e.target.value)}
              />
            </label>

            {mensajeRecuperar && (
              <p className="text-sm text-ink-muted">{mensajeRecuperar}</p>
            )}

            <button
              type="submit"
              disabled={enviandoRecuperar}
              className="w-full bg-brand text-white rounded-md py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {enviandoRecuperar ? "Enviando..." : "Enviar enlace"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMostrarRecuperar(false);
                setMensajeRecuperar(null);
              }}
              className="w-full text-center text-xs text-ink-muted underline"
            >
              Volver a iniciar sesión
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400">
          ¿No tienes cuenta? Pídele a tu administrador que la cree en la
          sección de Vendedores.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
