import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface TareaRow {
  id: string;
  tipo: string;
  titulo: string;
  fecha_vencimiento: string;
  dueno_comercial_id: string | null;
  cliente: { empresa: string } | null;
  oportunidad: { cliente: { empresa: string } | null } | null;
}

const TIPO_LABEL: Record<string, string> = {
  seguimiento_venta: "Ventas",
  seguimiento_recuperacion: "Recuperación",
  licitacion_entrega: "Licitación",
  checkin_cuenta_clave: "Cuenta clave",
  llamada_cartera: "Llamada",
};

function empresaDe(t: TareaRow): string {
  return t.cliente?.empresa || t.oportunidad?.cliente?.empresa || "—";
}

function diasAtraso(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha + "T00:00:00");
  return Math.round((hoy.getTime() - venc.getTime()) / 86400000);
}

function filaHtml(t: TareaRow): string {
  const atraso = diasAtraso(t.fecha_vencimiento);
  return `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:#374151;">${
      TIPO_LABEL[t.tipo] || t.tipo
    }</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">${t.titulo}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:#6b7280;">${empresaDe(
      t
    )}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:${
      atraso > 0 ? "#b91c1c" : "#374151"
    };">${atraso > 0 ? `${atraso}d atraso` : "Hoy"}</td>
  </tr>`;
}

function renderLista(tareas: TareaRow[]): string {
  const atrasadas = tareas.filter((t) => diasAtraso(t.fecha_vencimiento) > 0);
  const hoy = tareas.filter((t) => diasAtraso(t.fecha_vencimiento) === 0);
  let html = "";
  if (atrasadas.length) {
    html += `<p style="margin:16px 0 4px;font-weight:600;color:#b91c1c;">Atrasados (${atrasadas.length})</p><table style="width:100%;border-collapse:collapse;">${atrasadas.map(filaHtml).join("")}</table>`;
  }
  if (hoy.length) {
    html += `<p style="margin:16px 0 4px;font-weight:600;color:#111827;">Hoy (${hoy.length})</p><table style="width:100%;border-collapse:collapse;">${hoy.map(filaHtml).join("")}</table>`;
  }
  if (!atrasadas.length && !hoy.length) {
    html += `<p style="color:#059669;">Sin pendientes hoy 🎉</p>`;
  }
  return html;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: tareasData, error } = await admin
    .from("tareas")
    .select(
      "id, tipo, titulo, fecha_vencimiento, dueno_comercial_id, cliente:clientes(empresa), oportunidad:oportunidades(cliente:clientes(empresa))"
    )
    .eq("estado", "pendiente")
    .lte("fecha_vencimiento", hoy)
    .order("fecha_vencimiento");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const tareas = (tareasData ?? []) as unknown as TareaRow[];

  const { data: vendedores } = await admin
    .from("vendedores")
    .select("id, nombre, email, rol")
    .eq("activo", true);

  const porVendedor = new Map<string, TareaRow[]>();
  for (const t of tareas) {
    if (!t.dueno_comercial_id) continue;
    const arr = porVendedor.get(t.dueno_comercial_id) ?? [];
    arr.push(t);
    porVendedor.set(t.dueno_comercial_id, arr);
  }

  const from =
    process.env.RESEND_FROM_EMAIL || "CRM Rhinoboots <onboarding@resend.dev>";
  const emails: { from: string; to: string[]; subject: string; html: string }[] =
    [];

  for (const v of vendedores ?? []) {
    if (!v.email) continue;
    const tareasV = porVendedor.get(v.id) ?? [];
    if (tareasV.length === 0) continue;
    emails.push({
      from,
      to: [v.email],
      subject: `Tus seguimientos de hoy (${tareasV.length}) — CRM Rhinoboots`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#111827;">Hola ${v.nombre.split(" ")[0]},</h2>
        <p style="color:#374151;">Esto es lo que tienes pendiente hoy en el CRM:</p>
        ${renderLista(tareasV)}
        <p style="margin-top:20px;"><a href="https://rhinoboots-crm.vercel.app/seguimientos" style="color:#2563eb;">Ver en el CRM →</a></p>
      </div>`,
    });
  }

  const admins = (vendedores ?? []).filter((v) => v.rol === "admin" && v.email);
  if (admins.length > 0) {
    const nombrePorId = new Map((vendedores ?? []).map((v) => [v.id, v.nombre]));
    let resumenHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;">
      <h2 style="color:#111827;">Resumen del equipo — ${tareas.length} pendientes</h2>`;
    for (const [vid, todas] of porVendedor) {
      // Las llamadas de cartera tienen su propio resumen de las 5 p.m.
      const arr = todas.filter((t) => t.tipo !== "llamada_cartera");
      if (arr.length === 0) continue;
      resumenHtml +=`<h3 style="margin-top:20px;color:#111827;">${
        nombrePorId.get(vid) || "Sin asignar"
      } (${arr.length})</h3>${renderLista(arr)}`;
    }
    if (porVendedor.size === 0) {
      resumenHtml += `<p style="color:#059669;">Nadie tiene pendientes hoy 🎉</p>`;
    }
    resumenHtml += `<p style="margin-top:20px;"><a href="https://rhinoboots-crm.vercel.app/seguimientos" style="color:#2563eb;">Ver en el CRM →</a></p></div>`;

    for (const a of admins) {
      emails.push({
        from,
        to: [a.email as string],
        subject: `Resumen del equipo — ${tareas.length} seguimientos pendientes hoy`,
        html: resumenHtml,
      });
    }
  }

  if (emails.length === 0) {
    return NextResponse.json({ enviados: 0, mensaje: "Nada pendiente hoy" });
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

  return NextResponse.json({ enviados: emails.length, resultado });
}
