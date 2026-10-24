import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonoStatProps {
  label: string;
  value: string;
  /** e.g. +12 or -3 — rendered with % in the tone colour. */
  delta?: number;
  /** When set, the tile becomes a link. */
  href?: string;
  className?: string;
}

export function MonoStat({ label, value, delta, href, className }: MonoStatProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
          {label}
        </span>
        {href && <ArrowUpRight size={14} aria-hidden className="mt-0.5 shrink-0 text-paper-40" />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-medium tabular-nums text-paper">{value}</span>
        {delta !== undefined && (
          <span
            className={cn(
              'font-mono text-xs tabular-nums',
              delta >= 0 ? 'text-moss-bright' : 'text-vermilion'
            )}
          >
            {delta >= 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </div>
    </>
  );

  const classes = cn('card-admin block p-4 transition-colors', className);

  if (href) {
    return (
      <Link href={href} className={cn(classes, 'hover:border-paper-40')}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
