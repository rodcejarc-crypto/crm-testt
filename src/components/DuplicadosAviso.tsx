import Link from "next/link";
import type { ClienteSimilar } from "@/lib/data/clientes";

export function DuplicadosAviso({
  duplicados,
  puedesVerId,
  onConfirmar,
  onCancelar,
}: {
  duplicados: ClienteSimilar[];
  /** Un vendedor solo puede abrir SUS PROPIOS clientes; los de alguien más
   *  solo generan el aviso, sin link ni acceso. Un admin puede abrir todos. */
  puedesVerId: (d: ClienteSimilar) => boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-yellow-900">
        ⚠️ Encontramos {duplicados.length} cliente(s) con nombre parecido. Revisa
        antes de crear uno nuevo, para no duplicar el dueño de la cuenta.
      </p>
      <ul className="space-y-1">
        {duplicados.map((d) =>
          puedesVerId(d) ? (
            <li key={d.id} className="text-sm">
              <Link href={`/clientes/${d.id}`} target="_blank" className="text-brand underline">
                {d.empresa}
              </Link>
              <span className="text-ink-muted"> — {d.ciudad || "sin ciudad"}</span>
            </li>
          ) : (
            <li key={d.id} className="text-sm text-ink-muted">
              {d.empresa} — ya es cliente de <strong>{d.dueno_nombre || "otro vendedor"}</strong>
            </li>
          )
        )}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm px-3 py-1.5 rounded-md border border-line bg-card"
        >
          Cancelar y revisar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          className="text-sm px-3 py-1.5 rounded-md bg-yellow-600 text-white"
        >
          No es duplicado, crear de todas formas
        </button>
      </div>
    </div>
  );
}
