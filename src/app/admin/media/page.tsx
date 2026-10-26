'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Trash2, Upload } from 'lucide-react';
import { MediaImg } from '@/components/admin/media-img';
import { PageHeader } from '@/components/admin/page-header';
import { ConfirmDialog } from '@/components/admin/workbench/confirm-dialog';
import { useContent } from '@/components/admin/workbench/content-provider';
import { MEDIA_RULES } from '@/data/mock/media';
import type { MediaItem } from '@/lib/types';

/** mono bytes → "412 KB" / "1.3 MB" */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_LABEL: Record<MediaItem['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export default function MediaPage() {
  const { media, uploadMedia, removeMedia } = useContent();
  const [removing, setRemoving] = useState<MediaItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** shared failure line for both actions — verbatim from the server */
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Client pre-check (the SAME rules the server enforces, for instant
   * feedback), then the real upload: bytes → Supabase Storage bucket
   * `media`, rows → `media` table, via POST /admin/api/media — up to
   * MAX_BATCH files per drop/selection, all-or-nothing. Local state
   * changes only after the server confirms the stored items.
   */
  const handleFiles = async (files: FileList | null) => {
    if (uploading) return;
    if (!files || files.length === 0) return;
    const batch = Array.from(files);
    if (batch.length > MEDIA_RULES.maxPerBatch) {
      setActionError(
        `${batch.length} files in one drop — the limit is ${MEDIA_RULES.maxPerBatch} per batch.`
      );
      return;
    }
    for (const file of batch) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const okType =
        MEDIA_RULES.acceptedMime.includes(file.type) ||
        MEDIA_RULES.acceptedTypes.includes(ext as (typeof MEDIA_RULES.acceptedTypes)[number]);
      if (!okType) {
        setActionError(`“${file.name}” is not a jpg, png or webp.`);
        return;
      }
      if (file.size > MEDIA_RULES.maxBytes) {
        setActionError(
          `“${file.name}” is ${formatSize(file.size)} — the limit is ${formatSize(MEDIA_RULES.maxBytes)}.`
        );
        return;
      }
    }
    setActionError(null);
    setUploading(true);
    try {
      await uploadMedia(batch);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  /** Server removes the Storage object AND the row; close only on success. */
  const confirmRemove = async () => {
    if (!removing || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await removeMedia(removing.id);
      setRemoving(null);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const copyUrl = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Media"
        subtitle={`${media.length} file${media.length === 1 ? '' : 's'}`}
        right={
          <span className="font-mono text-[11px] text-paper-40">
            {MEDIA_RULES.acceptedTypes.join(', ')} · max{' '}
            {formatSize(MEDIA_RULES.maxBytes)}
          </span>
        }
      />

      {actionError && (
        <p
          role="alert"
          className="mb-4 rounded-card border border-vermilion px-3 py-2 font-mono text-[11px] text-vermilion"
        >
          {actionError}
        </p>
      )}

      {/* upload zone → POST /admin/api/media */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`mb-4 flex flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-8 text-center transition-colors ${
          dragOver ? 'border-vermilion bg-vermilion-20' : 'border-kraft-30 bg-kraft-12/50'
        }`}
      >
        <Upload size={18} aria-hidden className="text-kraft-60" />
        <p className="font-mono text-[11px] text-paper-70">
          {uploading ? 'Uploading to Storage…' : 'Drop files or click to add'}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-paper-40">
          jpg, png, webp · up to {MEDIA_RULES.maxPerBatch} at a time · max{' '}
          {formatSize(MEDIA_RULES.maxBytes)} each
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="btn-ghost-dark mt-1"
        >
          {uploading ? 'Uploading…' : 'Choose files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-label="Add media files"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {media.length === 0 ? (
        <p className="card-admin p-8 text-center font-mono text-xs text-paper-60">
          No media yet — add the studio&apos;s photographs above.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item) => (
            <li key={item.id} className="card-admin group flex flex-col overflow-hidden">
              {/* letter tile behind, real thumbnail on top (hidden on a
                  failed load, so a dead URL degrades to the tile) */}
              <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-kraft-12">
                <span className="font-display text-3xl text-kraft-60" aria-hidden>
                  {item.filename.charAt(0).toUpperCase()}
                </span>
                {item.url.startsWith('http') && (
                  <MediaImg
                    src={item.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute left-2 top-2 z-10 rounded-card bg-bg/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-paper-60">
                  {TYPE_LABEL[item.mimeType]}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <p className="truncate font-mono text-[11px] text-paper" title={item.filename}>
                  {item.filename}
                </p>
                <p className="font-mono text-[10px] tabular-nums text-paper-40">
                  {formatSize(item.sizeBytes)}
                </p>

                <div className="mt-auto flex items-center gap-1 pt-2">
                  <button
                    type="button"
                    onClick={() => copyUrl(item)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-card border border-line font-mono text-[10px] text-paper-70 hover:border-paper-40 hover:text-paper"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={11} aria-hidden className="text-moss-bright" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={11} aria-hidden />
                        Copy URL
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.filename}`}
                    onClick={() => setRemoving(item)}
                    className="flex h-9 w-9 items-center justify-center rounded-card border border-line text-paper-40 hover:border-vermilion hover:text-vermilion"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o && !deleting) setRemoving(null);
        }}
        title={`Delete “${removing?.filename ?? ''}”?`}
        body="The file is removed from Supabase Storage and from this library. Pages still referencing it will show a broken image."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
