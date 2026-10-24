'use client';

import { Check } from 'lucide-react';
import type { VariantType } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Pick ink or paper for the checkmark so it reads on any swatch. */
function checkColor(hex?: string): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#f4efe6';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // relative luminance (sRGB, gamma-expanded)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 140 ? '#16130f' : '#f4efe6';
}

interface VariantIndicatorProps {
  type: VariantType;
  /** Display value (colour name, size, material). */
  value: string;
  /** Colour hex for swatches; falls back to a kraft tone. */
  hex?: string;
  selected: boolean;
  onToggle: () => void;
  /** Right-aligned mono suffix, e.g. stock. */
  badge?: string;
}

/**
 * One clickable variant indicator.
 * - colour: 20px filled circle; selected = 2px vermilion ring + paper
 *   checkmark (a ring alone is invisible on similar swatches).
 * - size / material: JetBrains Mono chip; selected = vermilion border+text.
 */
export function VariantIndicator({
  type,
  value,
  hex,
  selected,
  onToggle,
  badge,
}: VariantIndicatorProps) {
  if (type === 'colour') {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className="group flex w-16 flex-col items-center gap-1.5 rounded-card p-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion/60"
        title={value}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border transition-shadow',
            selected
              ? 'shadow-[0_0_0_2px_#0f0f0f,0_0_0_4px_#e5391f]'
              : 'border-paper-15 group-hover:shadow-[0_0_0_1px_#3a3a3a]'
          )}
          style={{ backgroundColor: hex ?? '#d9c7a7' }}
        >
          {selected && (
            <Check
              size={12}
              strokeWidth={3}
              style={{ color: checkColor(hex) }}
            />
          )}
        </span>
        <span
          className={cn(
            'max-w-full truncate font-mono text-[9px] uppercase tracking-[0.08em]',
            selected ? 'text-paper' : 'text-paper-60'
          )}
        >
          {value}
        </span>
        {badge && (
          <span className="font-mono text-[9px] tabular-nums text-paper-40">{badge}</span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'rounded-card border px-3 py-1.5 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion/60',
        type === 'material' ? 'min-w-[5.5rem]' : 'min-w-[3rem]',
        selected
          ? 'border-vermilion text-vermilion'
          : 'border-line text-paper-70 hover:border-paper-40 hover:text-paper'
      )}
    >
      {value}
      {badge && <span className="ml-1.5 tabular-nums text-paper-40">{badge}</span>}
    </button>
  );
}
