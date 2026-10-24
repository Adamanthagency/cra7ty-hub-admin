import { cn } from '@/lib/utils';

type Tone = 'kraft' | 'moss' | 'transit' | 'vermilion' | 'neutral';

const dotClass: Record<Tone, string> = {
  kraft: 'bg-kraft',
  moss: 'bg-moss-bright',
  transit: 'bg-transit',
  vermilion: 'bg-vermilion',
  neutral: 'bg-paper-40',
};

const borderClass: Record<Tone, string> = {
  kraft: 'border-kraft-30',
  moss: 'border-moss-bright/40',
  transit: 'border-transit/40',
  vermilion: 'border-vermilion/50',
  neutral: 'border-line',
};

/** Canonical tone per known status; unknown strings fall back to neutral. */
const statusTone: Record<string, Tone> = {
  // order statuses
  pending: 'kraft',
  confirmed: 'moss',
  in_transit: 'transit',
  delivered: 'moss',
  cancelled: 'vermilion',
  // generic
  active: 'moss',
  inactive: 'neutral',
  expired: 'vermilion',
  paid: 'moss',
  failed: 'vermilion',
  published: 'moss',
  draft: 'kraft',
};

const statusLabel: Record<string, string> = {
  in_transit: 'In transit',
};

export function statusLabelFor(status: string): string {
  if (statusLabel[status]) return statusLabel[status];
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function StatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = statusTone[status] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-card border px-2 py-0.5 font-mono text-[11px] leading-none',
        'text-paper-70',
        borderClass[tone],
        className
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass[tone])} />
      {statusLabelFor(status)}
    </span>
  );
}
