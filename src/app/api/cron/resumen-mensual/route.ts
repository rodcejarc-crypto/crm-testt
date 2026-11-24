import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  obtenerCheckinsCompletados,
  obtenerHistorialTodo,
  obtenerMetasMes,
  obtenerOportunidadesTodas,
  obtenerVentasCerradas,
} from "@/lib/data/dashboard";
import { listarVendedores } from "@/lib/data/vendedores";
import { calcularDashboard, type ResultadoDashboard } from "@/lib/dashboard";
import { formatoMoneda } from "@/lib/pipelines/config";

export const dynamic = "force-dynamic";

// Corre el día 1 de cada mes (ver vercel.json) y reporta el mes ANTERIOR,
// que es el que ya cerró.
function mesAnterior(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fila(label: string, valor: string): string {
  return `<tr><td style="padding:4px 8px;font-size:13px;color:#6b7280;">${label}</td><td style="padding:4px 8px;font-size:13px;color:#111827;text-align:right;">${valor}</td></tr>`;
}

function tarjetaHtml(titulo: string, filas: string): string {
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
    <p style="font-weight:600;color:#111827;margin:0 0 6px;">${titulo}</p>
    <table style="width:100%;border-collapse:collapse;">${filas}</table>
  </div>`;
}

function renderHtml(anioMes: string, r: ResultadoDashboard): string {
  const ventasFilas = r.funnelResultado
    .map((f) =>
      fila(f.label, f.real === null ? "—" : `${pct(f.real)} (meta ${pct(f.meta)})`)
    )
    .join("");

  const paresFilas =
    [...r.paresPorVendedor, ...r.paresPorUnidad]
      .map((f) =>
        fila(
          f.nombre,
          `${f.real}/${f.meta} pares${f.cumplimiento !== null ? ` (${pct(f.cumplimiento)})` : ""}`
        )
      )
      .join("") ||
    `<tr><td style="padding:4px 8px;font-size:13px;color:#9ca3af;">Sin metas capturadas.</td></tr>`;
  const totalPares = fila(
    "Total empresa",
    `${r.totalParesReal}/${r.totalParesMeta} pares${
      r.totalParesMeta > 0 ? ` (${pct(r.totalParesReal / r.totalParesMeta)})` : ""
    }`
  );

  const licitacionesFilas =
    fila("Participadas", String(r.licitacionesParticipadasMes)) +
    fila("Adjudicadas", String(r.licitacionesAdjudicadasMes)) +
    fila("Tasa de éxito", r.tasaExitoLicitaciones === null ? "—" : pct(r.tasaExitoLicitaciones)) +
    fila("Monto en licitaciones activas", formatoMoneda(r.montoLicitacionesActivas));

  const recuperacionFilas =
    fila("Reactivadas este mes", String(r.reactivadasMes)) +
    fila("Facturación recuperada", formatoMoneda(r.facturacionRecuperada)) +
    fila("Total identificado como perdido", formatoMoneda(r.facturacionIdentificada));

  const estancadasHtml =
    r.estancadas.length === 0
      ? `<p style="color:#059669;font-size:13px;">Sin oportunidades estancadas 🎉</p>`
      : `<table style="width:100%;border-collapse:collapse;">${r.estancadas
          .slice(0, 15)
          .map(
            (o) =>
              `<tr><td style="padding:4px 8px;font-size:13px;color:#374151;">${o.empresa} — ${o.etapa}</td><td style="padding:4px 8px;font-size:13px;color:#6b7280;">${o.vendedorNombre}</td><td style="padding:4px 8px;font-size:13px;color:#b91c1c;text-align:right;">${o.diasEstancada}d</td></tr>`
          )
          .join("")}</table>${
          r.estancadas.length > 15
            ? `<p style="font-size:12px;color:#9ca3af;margin-top:4px;">y ${
                r.estancadas.length - 15
              } más...</p>`
            : ""
        }`;

  const rankingHtml = `<table style="width:100%;border-collapse:collapse;">
    <tr style="color:#6b7280;font-size:12px;text-align:left;">
      <th style="padding:4px 8px;">Vendedor</th><th style="padding:4px 8px;">Cierres</th><th style="padding:4px 8px;">Total actividad</th>
    </tr>
    ${r.rankingFilas
      .slice(0, 15)
      .map(
        (f) =>
          `<tr><td style="padding:4px 8px;font-size:13px;color:#111827;">${f.nombre}</td><td style="padding:4px 8px;font-size:13px;color:#059669;font-weight:600;">${f.cierres}</td><td style="padding:4px 8px;font-size:13px;color:#6b7280;">${f.total}</td></tr>`
      )
      .join("")}
  </table>`;

  return `<div style="font-family:Arial,sans-serif;max-width:640px;">
    <h2 style="color:#111827;">Dashboard ejecutivo — ${anioMes}</h2>
    ${tarjetaHtml("1. Ventas — embudo", ventasFilas)}
    ${tarjetaHtml("1. Ventas — pares vendidos vs. meta", paresFilas + totalPares)}
    ${tarjetaHtml("2. Licitaciones", licitacionesFilas)}
    ${tarjetaHtml("3. Recuperación de cartera", recuperacionFilas)}
    <div style="margin-bottom:16px;">
      <p style="font-weight:600;color:#111827;margin:0 0 6px;">
        4. Oportunidades estancadas (+15 días) — ${r.estancadas.length}
      </p>
      ${estancadasHtml}
    </div>
    <div style="margin-bottom:16px;">
      <p style="font-weight:600;color:#111827;margin:0 0 6px;">5. Ranking de actividad del equipo</p>
      ${rankingHtml}
    </div>
    <p style="margin-top:20px;"><a href="https://rhinoboots-crm.vercel.app/dashboard" style="color:#2563eb;">Ver dashboard completo en el CRM →</a></p>
  </div>`;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const anioMes = mesAnterior();

  const [oportunidades, historial, checkins, vendedores, metas, ventasCerradas] =
    await Promise.all([
      obtenerOportunidadesTodas(admin),
      obtenerHistorialTodo(admin),
      obtenerCheckinsCompletados(admin),
      listarVendedores(admin),
      obtenerMetasMes(anioMes, admin),
      obtenerVentasCerradas(admin),
    ]);

  const resultado = calcularDashboard({
    anioMes,
    ahora: Date.now(),
    oportunidades,
    historial,
    checkins,
    vendedores: vendedores.filter((v) => v.nombre !== "Sin asignar"),
    metas,
    ventasCerradas,
  });

  const { data: admins } = await admin
    .from("vendedores")
    .select("email")
    .eq("rol", "admin")
    .eq("activo", true);

  const destinatarios = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e));
  if (destinatarios.length === 0) {
    return NextResponse.json({ enviados: 0, mensaje: "No hay administradores con correo" });
  }

  const from = process.env.RESEND_FROM_EMAIL || "CRM Rhinoboots <onboarding@resend.dev>";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: destinatarios,
      subject: `Dashboard ejecutivo — ${anioMes} — CRM Rhinoboots`,
      html: renderHtml(anioMes, resultado),
    }),
  });

  const resultadoEnvio = await resp.json();
  if (!resp.ok) {
    return NextResponse.json({ error: resultadoEnvio }, { status: 500 });
  }

  return NextResponse.json({ enviados: destinatarios.length, anioMes, resultadoEnvio });
}
