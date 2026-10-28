'use client';

import { useId, useRef, useState } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import type { ContentFieldType } from '@/lib/types';
import { validateField, type FieldSpec } from '@/lib/content-validation';
import { MediaImg } from '@/components/admin/media-img';
import { cn } from '@/lib/utils';
import { useContent } from './content-provider';
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

  // Upload straight into this field — the SAME backing path as the Media
  // page and the product editor's photo card (POST /admin/api/media), so a
  // hero slide can be added without leaving the section editor. The file
  // rules mirror the product editor: jpg/png/webp, 5 MB, one at a time
  // because this field holds exactly one URL.
  const { uploadMedia } = useContent();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploadNote(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadNote(
        `“${file.name}” is not a jpg, png or webp — nothing was uploaded.`,
      );
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadNote(
        `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 5 MB per file. Nothing was uploaded.`,
      );
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const [item] = await uploadMedia([file]);
      if (item) {
        setUploadNote(null);
        onChange(item.url);
      } else {
        setUploadNote('The upload finished but returned no file — nothing was changed.');
      }
    } catch (error) {
      setUploadNote((error as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[11px] text-paper-70 hover:border-paper-40 hover:text-paper disabled:opacity-50"
              >
                <Upload size={12} aria-hidden />
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPickerOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[11px] text-paper-70 hover:border-paper-40 hover:text-paper disabled:opacity-50"
              >
                {text ? 'Change image' : 'Choose from media'}
              </button>
            </div>
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
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label={`Upload an image for ${label}`}
              onChange={(e) => void upload(e.target.files)}
            />
            {uploadNote && (
              <p role="alert" className="max-w-[16rem] font-mono text-[10px] leading-snug text-vermilion">
                {uploadNote}
              </p>
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
