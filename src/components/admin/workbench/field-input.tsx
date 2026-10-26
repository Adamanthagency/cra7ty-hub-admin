'use client';

import { useId, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { ContentFieldType } from '@/lib/types';
import { validateField, type FieldSpec } from '@/lib/content-validation';
import { MediaImg } from '@/components/admin/media-img';
import { cn } from '@/lib/utils';
import { MediaPicker } from './media-picker';

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
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={type === 'image' ? undefined : id}
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

      {type === 'image' ? (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-kraft-12',
              className,
            )}
          >
            {text ? (
              <MediaImg
                src={text}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ImagePlus size={16} className="text-paper-40" aria-hidden />
            )}
          </span>
          <div className="flex flex-col items-start gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[11px] text-paper-70 hover:border-paper-40 hover:text-paper disabled:opacity-50"
            >
              {text ? 'Change image' : 'Choose from media'}
            </button>
            {text && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange('')}
                className="inline-flex h-6 items-center gap-1 font-mono text-[10px] text-paper-40 hover:text-vermilion disabled:opacity-50"
              >
                <X size={11} aria-hidden />
                Remove
              </button>
            )}
          </div>
          <MediaPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onSelect={(item) => onChange(item.url)}
          />
        </div>
      ) : type === 'longtext' ? (
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
