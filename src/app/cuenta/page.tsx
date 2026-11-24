"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CuentaPage() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(false);
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
    setPassword("");
    setPassword2("");
    setExito(true);
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Mi cuenta</h1>
        <p className="text-ink-muted text-sm">Cambia tu contraseña cuando quieras.</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-card border border-line rounded-lg p-6 space-y-4"
      >
        <label className="block">
          <span className="block text-sm font-medium text-ink-muted mb-1">
            Nueva contraseña
          </span>
          <input
            type="password"
            required
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
        {exito && (
          <p className="text-sm text-green-700">✅ Contraseña actualizada.</p>
        )}

        <button
          type="submit"
          disabled={guardando}
          className="bg-brand text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}
