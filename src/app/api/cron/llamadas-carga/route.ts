import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Carga diaria de llamadas de cartera: a las 6:00 a.m. de México (12:00 UTC;
 * México no tiene horario de verano) de lunes a viernes, cada vendedor del
 * programa recibe sus clientes NUEVOS. Lo que no registró ayer se queda como
 * atrasado y se acumula. Se puede correr de nuevo el mismo día sin duplicar.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoyMx = new Date(Date.now() - 6 * 3600 * 1000);
  const diaSemana = hoyMx.getUTCDay();
  if (diaSemana < 1 || diaSemana > 5) {
    return NextResponse.json({ omitido: "fin de semana" });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("asignar_llamadas_diarias", { p_dia: hoyMx.toISOString().slice(0, 10) });
  if (error) {
    console.error("asignar_llamadas_diarias:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const dia = hoyMx.toISOString().slice(0, 10);

  return NextResponse.json({ dia, vendedores: data });
}
