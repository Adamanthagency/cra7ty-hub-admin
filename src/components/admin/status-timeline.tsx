import type { OrderStatus } from '@/lib/types';
import { statusLabelFor } from './status-chip';
import { cn } from '@/lib/utils';

const AXIS: OrderStatus[] = ['pending', 'confirmed', 'in_transit', 'delivered'];

/**
 * Forward-only transitions from the current status.
 * Ruling: "no going back" means strictly later axis nodes; Cancelled is a
 * side-terminal offered unless the order is already cancelled. A delivered
 * order has no forward moves.
 */
export function forwardStatuses(current: OrderStatus): OrderStatus[] {
  if (current === 'delivered' || current === 'cancelled') return [];
  const idx = AXIS.indexOf(current);
  const forward = AXIS.slice(idx + 1);
  return [...forward, 'cancelled'];
}

interface StatusTimelineProps {
  status: OrderStatus;
}

/**
 * The five statuses as nodes. On the normal axis: completed nodes fill
 * moss, the current node is vermilion, upcoming nodes are hollow.
 * Cancelled renders as a terminal node after the axis.
 */
export function StatusTimeline({ status }: StatusTimelineProps) {
  const cancelled = status === 'cancelled';
  const currentIndex = AXIS.indexOf(status);

  const nodes = AXIS.map((s, i) => {
    const state: 'done' | 'current' | 'upcoming' | 'dim' = cancelled
      ? 'dim'
      : i < currentIndex
        ? 'done'
        : i === currentIndex
          ? 'current'
          : 'upcoming';
    return { key: s, label: statusLabelFor(s), state, last: false };
  });

  nodes.push({
    key: 'cancelled',
    label: 'Cancelled',
    state: cancelled ? 'current' : 'upcoming',
    last: true,
  });

  return (
    <ol className="space-y-0" aria-label="Order status timeline">
      {nodes.map((node, i) => (
        <li key={node.key} className="relative flex items-start gap-3">
          {/* connector */}
          <div className="flex flex-col items-center" aria-hidden>
            <span
              className={cn(
                'z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                node.state === 'done' && 'border-moss-bright bg-moss-bright',
                node.state === 'current' && 'border-vermilion bg-vermilion',
                node.state === 'upcoming' && 'border-line bg-surface',
                node.state === 'dim' && 'border-line bg-surface'
              )}
            />
            {i < nodes.length - 1 && (
              <span
                className={cn(
                  'w-px flex-1',
                  node.state === 'done' ? 'bg-moss-bright/60' : 'bg-line'
                )}
                style={{ minHeight: '1.75rem' }}
              />
            )}
          </div>
          <span
            className={cn(
              'pb-4 text-sm',
              node.state === 'done' && 'text-paper-70',
              node.state === 'current' && 'font-medium text-paper',
              node.state === 'upcoming' && 'text-paper-40',
              node.state === 'dim' && 'text-paper-40'
            )}
          >
            {node.label}
            {node.state === 'current' && !cancelled && (
              <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.16em] text-vermilion">
                now
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
