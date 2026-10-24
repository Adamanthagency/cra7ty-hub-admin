'use client';

import { cn } from '@/lib/utils';

interface VariantChipsProps {
  options: string[];
  value: string | undefined;
  onChange: (variant: string) => void;
  label?: string;
}

/**
 * Fixed layout-variant picker — button chips, same styling as the
 * product editor's variant-type selector. Never a dropdown: the client
 * picks between named layouts, not arbitrary values.
 */
export function VariantChips({ options, value, onChange, label = 'Layout' }: VariantChipsProps) {
  if (options.length === 0) return null;
  return (
    <div>
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
        {label}
      </span>
      <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-card border border-line p-0.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={cn(
              'rounded-[3px] px-3 py-1.5 font-mono text-[11px] capitalize transition-colors',
              value === option ? 'bg-paper-12 text-paper' : 'text-paper-60 hover:text-paper'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
