export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  /** Rendered in mono, e.g. a count. */
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-2xl tracking-tight text-paper md:text-[28px]">
          {title}
        </h1>
        {subtitle && (
          <span className="font-mono text-xs tabular-nums text-paper-60">{subtitle}</span>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
