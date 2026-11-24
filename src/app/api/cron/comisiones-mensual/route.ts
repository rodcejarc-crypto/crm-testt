import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerDatosMes } from "@/lib/data/comisiones";
import { calcularComisionesMes, type DesgloseComision } from "@/lib/comisiones";
import { formatoMoneda } from "@/lib/pipelines/config";

export const dynamic = "force-dynamic";

// Corre el día 1 de cada mes (ver vercel.json) y reporta el mes ANTERIOR,
// que es el que ya cerró.
function mesAnterior(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function filaHtml(f: DesgloseComision): string {
  const rubros: [string, number][] = (
    [
      ["Calzado de Piel", f.comisionPiel],
      ["PVC", f.comisionPvc],
      ["Calzado Económico", f.comisionEconomico],
      ["Clientes Recuperados", f.comisionRecuperados],
      ["Acelerador", f.aceleradorBono],
      ["Bono de tienda", f.bonoTienda],
      ["Bono de sucursal", f.bonoSucursal],
    ] as [string, number][]
  ).filter(([, v]) => v);

  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;">
      <strong style="color:#111827;">${f.nombre}${f.etiqueta ? ` — ${f.etiqueta}` : ""}</strong>
      <strong style="color:#111827;">${formatoMoneda(f.total)}</strong>
    </div>
    ${
      rubros.length
        ? `<table style="width:100%;margin-top:6px;">${rubros
            .map(
              ([label, v]) =>
                `<tr><td style="font-size:13px;color:#6b7280;padding:2px 0;">${label}</td><td style="font-size:13px;color:#374151;text-align:right;">${formatoMoneda(
                  v
                )}</td></tr>`
            )
            .join("")}</table>`
        : `<p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">Sin comisión este mes.</p>`
    }
  </div>`;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const anioMes = mesAnterior();

  let filas: DesgloseComision[];
  try {
    const datos = await obtenerDatosMes(anioMes, admin);
    filas = calcularComisionesMes(datos);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al calcular comisiones" },
      { status: 500 }
    );
  }

  if (filas.length === 0) {
    return NextResponse.json({ enviados: 0, mensaje: `Sin metas capturadas para ${anioMes}` });
  }

  const { data: vendedores } = await admin
    .from("vendedores")
    .select("id, nombre, email, rol")
    .eq("activo", true);

  const from = process.env.RESEND_FROM_EMAIL || "CRM Rhinoboots <onboarding@resend.dev>";
  const emails: { from: string; to: string[]; subject: string; html: string }[] = [];

  // Un correo por vendedor, solo con sus propias filas (puede tener más de
  // una si tiene varios contextos de meta).
  for (const v of vendedores ?? []) {
    if (!v.email) continue;
    const propias = filas.filter((f) => f.vendedorId === v.id);
    if (propias.length === 0) continue;
    const total = propias.reduce((s, f) => s + f.total, 0);
    emails.push({
      from,
      to: [v.email],
      subject: `Tu comisión de ${anioMes} — ${formatoMoneda(total)} — CRM Rhinoboots`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#111827;">Hola ${v.nombre.split(" ")[0]},</h2>
        <p style="color:#374151;">Este es el desglose de tu comisión de ${anioMes}:</p>
        ${propias.map(filaHtml).join("")}
        <p style="margin-top:16px;"><a href="https://rhinoboots-crm.vercel.app/comisiones" style="color:#2563eb;">Ver en el CRM →</a></p>
      </div>`,
    });
  }

  // Un correo con todo el equipo para Dirección Comercial.
  const admins = (vendedores ?? []).filter((v) => v.rol === "admin" && v.email);
  if (admins.length > 0) {
    const totalGeneral = filas.reduce((s, f) => s + f.total, 0);
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;">
      <h2 style="color:#111827;">Comisiones del equipo — ${anioMes}</h2>
      <p style="color:#374151;">Total: <strong>${formatoMoneda(totalGeneral)}</strong></p>
      ${filas.map(filaHtml).join("")}
      <p style="margin-top:16px;"><a href="https://rhinoboots-crm.vercel.app/comisiones" style="color:#2563eb;">Ver en el CRM →</a></p>
    </div>`;
    for (const a of admins) {
      emails.push({
        from,
        to: [a.email as string],
        subject: `Comisiones del equipo — ${anioMes} — ${formatoMoneda(totalGeneral)}`,
        html,
      });
    }
  }

  if (emails.length === 0) {
    return NextResponse.json({ enviados: 0, mensaje: "Nadie con correo configurado" });
  }

  const resp = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emails),
  });

  const resultado = await resp.json();
  if (!resp.ok) {
    return NextResponse.json({ error: resultado }, { status: 500 });
  }

  return NextResponse.json({ enviados: emails.length, anioMes, resultado });
}
