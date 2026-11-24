"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [tieneSesion, setTieneSesion] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setTieneSesion(Boolean(data.user));
      setListo(true);
    });
    // El enlace del correo entrega la sesión un poco después de cargar la
    // página; si llega por este evento, actualizamos igual.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setTieneSesion(Boolean(session?.user));
        setListo(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setExito(true);
    setTimeout(() => router.push("/"), 1500);
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
          <h1 className="text-xl font-bold text-ink">
            Crear nueva contraseña
          </h1>
        </div>

        <div className="bg-card border border-line rounded-lg p-6">
          {!listo ? (
            <p className="text-sm text-ink-muted">Cargando...</p>
          ) : exito ? (
            <p className="text-sm text-green-700">
              ✅ Contraseña actualizada. Entrando al CRM...
            </p>
          ) : !tieneSesion ? (
            <p className="text-sm text-ink-muted">
              Este enlace ya expiró o no es válido. Pide uno nuevo desde la
              pantalla de inicio de sesión (&quot;¿Olvidaste tu
              contraseña?&quot;).
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-ink-muted mb-1">
                  Nueva contraseña
                </span>
                <input
                  type="password"
                  required
                  autoFocus
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-ink-muted mb-1">
                  Repite la contraseña
                </span>
                <input
                  type="password"
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                />
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={guardando}
                className="w-full bg-brand text-white rounded-md py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
