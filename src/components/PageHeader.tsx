export function PageHeader({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <p className="flex items-center gap-2 font-display text-xs font-medium tracking-[0.2em] text-brand uppercase">
          <span className="inline-block w-4 h-[2px] bg-brand" />
          Rhinoboots · CRM
        </p>
        <h1 className="font-body font-bold text-3xl text-ink mt-1">{titulo}</h1>
        {descripcion && <p className="text-sm text-ink-muted mt-1">{descripcion}</p>}
      </div>
      {accion && <div className="flex items-center gap-2 flex-wrap">{accion}</div>}
    </div>
  );
}
