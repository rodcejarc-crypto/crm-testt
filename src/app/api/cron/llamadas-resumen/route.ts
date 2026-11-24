import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface LlamadaRow {
  vendedor_id: string | null;
  resultado: string;
  nota: string | null;
  oportunidad_id: string | null;
  cliente: { empresa: string } | null;
}

/** Quién recibe este resumen: solo la administración general (Marcela), no el resto de administradores. */
const DESTINATARIOS = ["marce.rhino@gmail.com"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Resumen de las 5 p.m. (hora de México) para la administración: cómo le fue
 * a cada vendedor con sus llamadas de cartera del día.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  // México no tiene horario de verano: siempre UTC-6.
  const hoyMx = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  const inicioDia = `${hoyMx}T06:00:00Z`;

  const { data: vendedores } = await admin
    .from("vendedores")
    .select("id, nombre, email, rol, meta_llamadas_diarias")
    .eq("activo", true);

  const participantes = (vendedores ?? []).filter((v) => (v.meta_llamadas_diarias ?? 0) > 0);
  const admins = (vendedores ?? []).filter(
    (v) => v.rol === "admin" && v.email && DESTINATARIOS.includes(v.email.toLowerCase())
  );
  if (participantes.length === 0 || admins.length === 0) {
    return NextResponse.json({ enviados: 0, mensaje: "Sin participantes o sin destinatarios" });
  }

  const [{ data: llamadasData, error }, { data: pendientesData }, { data: avisosData }, { data: pausasData }] = await Promise.all([
    admin
      .from("llamadas")
      .select("vendedor_id, resultado, nota, oportunidad_id, cliente:clientes!llamadas_cliente_id_fkey(empresa)")
      .gte("creado_en", inicioDia),
    admin
      .from("tareas")
      .select("dueno_comercial_id")
      .eq("tipo", "llamada_cartera")
      .eq("estado", "pendiente")
      .lte("fecha_vencimiento", hoyMx),
    admin.from("llamadas_cartera_avisos").select("vendedor_id, faltaron").eq("dia", hoyMx),
    admin
      .from("llamadas_pausas")
      .select("vendedor_id, hasta")
      .is("cancelada_en", null)
      .lte("desde", hoyMx)
      .gte("hasta", hoyMx),
  ]);
  const enPausa = new Map((pausasData ?? []).map((p) => [p.vendedor_id as string, p.hasta as string]));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const llamadas = (llamadasData ?? []) as unknown as LlamadaRow[];

  const pendientes = new Map<string, number>();
  for (const t of pendientesData ?? []) {
    if (t.dueno_comercial_id) {
      pendientes.set(t.dueno_comercial_id, (pendientes.get(t.dueno_comercial_id) ?? 0) + 1);
    }
  }

  const celda = "padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;";
  let filas = "";
  const tot = { meta: 0, hechas: 0, contactos: 0, noContesto: 0, oportunidades: 0, pendientes: 0 };
  for (const v of participantes) {
    const pausaHasta = enPausa.get(v.id);
    const mias = llamadas.filter((l) => l.vendedor_id === v.id);
    const hechas = mias.length;
    const contactos = mias.filter((l) => !["no_contesto", "numero_equivocado"].includes(l.resultado)).length;
    const noContesto = mias.filter((l) => l.resultado === "no_contesto").length;
    const oportunidades = mias.filter((l) => l.oportunidad_id).length;
    const pend = pendientes.get(v.id) ?? 0;
    const meta = v.meta_llamadas_diarias ?? 0;
    // En pausa de cargas nuevas: su meta del día no cuenta (no se le cargaron llamadas nuevas).
    if (!pausaHasta) tot.meta += meta;
    tot.hechas += hechas;
    tot.contactos += contactos;
    tot.noContesto += noContesto;
    tot.oportunidades += oportunidades;
    tot.pendientes += pend;
    const color = pausaHasta ? "#374151" : hechas >= meta ? "#047857" : hechas === 0 ? "#b91c1c" : "#374151";
    filas += `<tr>
      <td style="${celda}">${esc(v.nombre)}${pausaHasta ? `<br><span style="color:#b45309;font-size:11px;">Sin cargas nuevas hasta el ${pausaHasta.split("-").reverse().join("/")}</span>` : ""}</td>
      <td style="${celda}color:${color};font-weight:600;">${pausaHasta ? hechas : `${hechas} de ${meta}`}</td>
      <td style="${celda}">${contactos}</td>
      <td style="${celda}">${noContesto}</td>
      <td style="${celda}">${oportunidades}</td>
      <td style="${celda}color:${pend > 0 ? "#b91c1c" : "#374151"};">${pend}</td>
    </tr>`;
  }

  const agotadas = (avisosData ?? []).map(
    (a) => `<li>Cartera de llamadas agotada para <strong>${esc(participantes.find((v) => v.id === a.vendedor_id)?.nombre ?? "—")}</strong>: faltaron ${a.faltaron} clientes para completar su carga de hoy.</li>`
  );
  const nuevas = llamadas.filter((l) => l.oportunidad_id);
  const rechazos = llamadas.filter((l) => ["contesto_no_interesa", "no_apto"].includes(l.resultado));
  const nombreDe = new Map((vendedores ?? []).map((v) => [v.id, v.nombre]));
  const lista = (rows: LlamadaRow[]) =>
    `<ul style="margin:6px 0;padding-left:20px;font-size:13px;color:#374151;">${rows
      .map(
        (l) =>
          `<li>${esc(l.cliente?.empresa ?? "—")} <span style="color:#6b7280;">(${esc(
            nombreDe.get(l.vendedor_id ?? "") ?? "—"
          )})</span>${l.nota ? ` — ${esc(l.nota)}` : ""}</li>`
      )
      .join("")}</ul>`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;">
    <h2 style="color:#111827;">Llamadas de cartera — resumen del día</h2>
    <p style="color:#374151;">Se hicieron <strong>${tot.hechas}</strong> de <strong>${tot.meta}</strong> llamadas;
      contestaron en <strong>${tot.contactos}</strong> y se abrieron <strong>${tot.oportunidades}</strong> oportunidades nuevas.</p>
    ${agotadas.length ? `<ul style="margin:6px 0;padding-left:20px;font-size:13px;color:#b91c1c;">${agotadas.join("")}</ul>` : ""}
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#f3f4f6;text-align:left;">
        <th style="${celda}">Vendedor</th><th style="${celda}">Hechas</th><th style="${celda}">Contestaron</th>
        <th style="${celda}">No contestó</th><th style="${celda}">Oportunidades</th><th style="${celda}">Sin hacer</th>
      </tr>${filas}
      <tr style="font-weight:700;"><td style="${celda}">Total</td><td style="${celda}">${tot.hechas} de ${tot.meta}</td>
        <td style="${celda}">${tot.contactos}</td><td style="${celda}">${tot.noContesto}</td>
        <td style="${celda}">${tot.oportunidades}</td><td style="${celda}">${tot.pendientes}</td></tr>
    </table>
    ${nuevas.length ? `<p style="margin:16px 0 0;font-weight:600;color:#047857;">Oportunidades nuevas</p>${lista(nuevas)}` : ""}
    ${rechazos.length ? `<p style="margin:16px 0 0;font-weight:600;color:#374151;">No les interesa o no son aptos (motivo)</p>${lista(rechazos)}` : ""}
    <p style="margin-top:20px;"><a href="https://rhinoboots-crm.vercel.app/dashboard" style="color:#2563eb;">Ver en el CRM →</a></p>
  </div>`;

  // Remitente del dominio verificado en Resend: el de pruebas (resend.dev) solo
  // entrega al dueño de la cuenta y rechaza el envío si hay otros destinatarios.
  const configurado = process.env.RESEND_FROM_EMAIL;
  const from = configurado && !configurado.includes("resend.dev") ? configurado : "CRM Rhinoboots <crm@rhinoboots.com.mx>";
  const asunto = `Llamadas de hoy: ${tot.hechas} de ${tot.meta} · ${tot.oportunidades} oportunidades — CRM Rhinoboots`;

  // Un envío por administrador: si uno falla, los demás igual lo reciben.
  const resultados = await Promise.all(
    admins.map(async (a) => {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [a.email as string], subject: asunto, html }),
      });
      const cuerpo = await resp.json().catch(() => ({}));
      if (!resp.ok) console.error("llamadas-resumen: no se pudo enviar a", a.email, JSON.stringify(cuerpo));
      return { para: a.email as string, ok: resp.ok, detalle: cuerpo };
    })
  );
  const enviados = resultados.filter((r) => r.ok).length;
  if (enviados === 0) return NextResponse.json({ error: "No se envió ningún correo", resultados }, { status: 500 });
  return NextResponse.json({ enviados, resultados });
}
