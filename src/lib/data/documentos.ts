import { createClient } from "@/lib/supabase/client";
import { nombreSeguroArchivo } from "@/lib/nombre-archivo";

export type CategoriaDocumento = "cotizacion" | "factura";

export interface ArchivoDocumento {
  name: string;
  path: string;
  size: number;
  createdAt: string | null;
}

const BUCKET = "documentos_oportunidad";

export async function subirDocumento(
  oportunidadId: string,
  categoria: CategoriaDocumento,
  file: File
): Promise<void> {
  const supabase = createClient();
  const path = `${oportunidadId}/${categoria}/${Date.now()}-${nombreSeguroArchivo(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
}

export async function listarDocumentos(
  oportunidadId: string,
  categoria: CategoriaDocumento
): Promise<ArchivoDocumento[]> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).list(`${oportunidadId}/${categoria}`);
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({
      // Se muestra sin el número que se antepone al subirlo.
      name: f.name.replace(/^[0-9]{13}-/, ""),
      path: `${oportunidadId}/${categoria}/${f.name}`,
      size: f.metadata?.size ?? 0,
      createdAt: f.created_at ?? null,
    }));
}

export async function urlDocumento(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function borrarDocumento(path: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
