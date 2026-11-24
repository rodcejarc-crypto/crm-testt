import { createClient } from "@/lib/supabase/client";

export interface DescartadoFila {
  id: string;
  empresa: string;
  rfc: string | null;
  motivo_descarte: string | null;
  motivo_descarte_tipo: string | null;
  descartado_en: string | null;
  dueno: { nombre: string } | null;
  descartado_por_vendedor: { nombre: string } | null;
}

/** Todos los clientes descartados (solo los ve la administración; RLS lo respalda). */
export async function listarDescartados(): Promise<DescartadoFila[]> {
  const supabase = createClient();
  const PAGINA = 1000;
  const todos: DescartadoFila[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id, empresa, rfc, motivo_descarte, motivo_descarte_tipo, descartado_en, " +
          "dueno:vendedores!clientes_dueno_comercial_id_fkey(nombre), " +
          "descartado_por_vendedor:vendedores!clientes_descartado_por_fkey(nombre)"
      )
      .eq("descartado", true)
      .order("descartado_en", { ascending: false, nullsFirst: false })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as unknown as DescartadoFila[];
    todos.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return todos;
}

export async function reactivarDescartado(clienteId: string, motivo: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reactivar_descartado", { p_cliente: clienteId, p_motivo: motivo });
  if (error) throw new Error(error.message);
}

export interface DuenoPorRevisarFila {
  llamadaId: string;
  creadoEn: string;
  comentario: string | null;
  clienteId: string;
  empresa: string;
  duenoId: string | null;
  duenoNombre: string | null;
  gestionadoPorId: string;
  gestionadoPorNombre: string;
  registradoPor: string | null;
  oportunidad: string | null;
}

interface FilaCruda {
  id: string;
  creado_en: string;
  nota: string | null;
  gestionado_por_id: string | null;
  cliente: { id: string; empresa: string; dueno_comercial_id: string | null; dueno: { nombre: string } | null } | null;
  gestionado: { nombre: string } | null;
  registrado: { nombre: string } | null;
  oportunidad_gestion: { pipeline: string; etapa: string } | null;
}

/** Clientes que un vendedor dijo que otro ya trabaja y cuyo dueño actual es distinto: la administración decide. */
export async function listarDuenoPorRevisar(): Promise<DuenoPorRevisarFila[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("llamadas")
    .select(
      "id, creado_en, nota, gestionado_por_id, " +
        "cliente:clientes!llamadas_cliente_id_fkey(id, empresa, dueno_comercial_id, dueno:vendedores!clientes_dueno_comercial_id_fkey(nombre)), " +
        "gestionado:vendedores!llamadas_gestionado_por_id_fkey(nombre), " +
        "registrado:vendedores!llamadas_vendedor_id_fkey(nombre), " +
        "oportunidad_gestion:oportunidades!llamadas_oportunidad_gestion_id_fkey(pipeline, etapa)"
    )
    .eq("resultado", "gestion_activa")
    .is("revisado_en", null)
    .order("creado_en", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as FilaCruda[])
    .filter((l) => l.cliente && l.gestionado_por_id && l.gestionado_por_id !== l.cliente.dueno_comercial_id)
    .map((l) => ({
      llamadaId: l.id,
      creadoEn: l.creado_en,
      comentario: l.nota,
      clienteId: l.cliente!.id,
      empresa: l.cliente!.empresa,
      duenoId: l.cliente!.dueno_comercial_id,
      duenoNombre: l.cliente!.dueno?.nombre ?? null,
      gestionadoPorId: l.gestionado_por_id!,
      gestionadoPorNombre: l.gestionado?.nombre ?? "—",
      registradoPor: l.registrado?.nombre ?? null,
      oportunidad: l.oportunidad_gestion ? `${l.oportunidad_gestion.pipeline} — ${l.oportunidad_gestion.etapa}` : null,
    }));
}

/** Reasigna el cliente al vendedor correcto (o, con null, lo deja como está) y marca la revisión como hecha. */
export async function resolverDuenoPorRevisar(llamadaId: string, nuevoDuenoId: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("resolver_dueno_por_revisar", {
    p_llamada: llamadaId,
    p_nuevo_dueno: nuevoDuenoId,
  });
  if (error) throw new Error(error.message);
}
