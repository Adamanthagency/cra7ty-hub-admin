'use client';

import { useId } from 'react';
import type { ContentFieldType } from '@/lib/types';
import { validateField, type FieldSpec } from '@/lib/content-validation';
import { cn } from '@/lib/utils';

interface FieldInputProps {
  label: string;
  type: ContentFieldType;
  value: string | number;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  tokens?: string[];
  /** show the counter even when maxLength is absent */
  showCount?: boolean;
  disabled?: boolean;
  /** extra classes for the input/textarea (visual panel raises targets to 44px) */
  className?: string;
}

/**
 * One labelled text/longtext/link/number field with a mono character
 * counter, a token hint (when the field accepts {shown}/{total}) and a
 * plain-English error line. Renders as textarea for longtext.
 */
export function FieldInput({
  label,
  type,
  value,
  onChange,
  required = true,
  maxLength,
  tokens,
  showCount = false,
  disabled = false,
  className,
}: FieldInputProps) {
  const id = useId();
  const text = String(value ?? '');
  const spec: FieldSpec = { type, required, maxLength, tokens };
  const error = validateField(spec, text);
  const over = maxLength !== undefined && text.length > maxLength;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
        >
          {label}
          {!required && (
            <span className="ml-1 normal-case tracking-normal text-paper-40">
              (optional)
            </span>
          )}
        </label>
        {(maxLength !== undefined || showCount) && (
          <span
            className={cn(
              'font-mono text-[10px] tabular-nums',
              over ? 'text-vermilion' : 'text-paper-40'
            )}
          >
            {text.length}
            {maxLength !== undefined && ` / ${maxLength}`}
          </span>
        )}
      </div>

      {type === 'longtext' ? (
        <textarea
          id={id}
          rows={3}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn('input-hairline resize-y', className)}
        />
      ) : (
        <input
          id={id}
          type="text"
          inputMode={type === 'number' ? 'numeric' : undefined}
          value={text}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn('input-hairline', type === 'number' && 'font-mono', className)}
        />
      )}

      {tokens && tokens.length > 0 && (
        <p className="mt-1 font-mono text-[10px] text-paper-40">
          Tokens allowed: {tokens.map((t) => `{${t}}`).join(', ')}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 font-mono text-[11px] leading-snug text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
}
