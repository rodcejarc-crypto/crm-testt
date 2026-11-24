"use client";

import { useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { PageHeader } from "@/components/PageHeader";
import { PIPELINES } from "@/lib/pipelines/config";
import type { PipelineKey } from "@/lib/types";

const TABS: { key: PipelineKey; letra: string; descripcion: string }[] = [
  {
    key: "ventas",
    letra: "V",
    descripcion: "Todas las oportunidades comerciales abiertas, de lead a cierre.",
  },
  {
    key: "licitaciones",
    letra: "L",
    descripcion: "Concursos y licitaciones públicas o privadas en curso.",
  },
  {
    key: "recuperacion",
    letra: "R",
    descripcion: "Cuentas inactivas identificadas para reactivar.",
  },
];

export default function PipelinesPage() {
  const [activo, setActivo] = useState<PipelineKey>("ventas");
  const tabActivo = TABS.find((t) => t.key === activo)!;

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-4">
      <PageHeader
        titulo="Pipelines"
        descripcion="Arrastra las tarjetas entre columnas, o ábrelas para moverlas desde un botón."
      />

      <div>
        <div className="flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActivo(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-display font-medium border-b-2 -mb-px ${
                activo === t.key
                  ? "border-brand text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  activo === t.key ? "bg-ink text-card" : "bg-section text-ink-muted"
                }`}
              >
                {t.letra}
              </span>
              {PIPELINES[t.key].label}
            </button>
          ))}
        </div>
        <p className="text-xs italic text-ink-muted mt-2">{tabActivo.descripcion}</p>
      </div>

      <KanbanBoard key={activo} pipeline={activo} />
    </main>
  );
}
