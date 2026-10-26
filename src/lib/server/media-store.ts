import { configProblem, rest, supabaseFetch, supabaseOrigin } from '@/lib/server/content-store';
import type { MediaItem } from '@/lib/types';

/**
 * Server-side media library (backend wiring, Stage 6).
 *
 * Every upload is TWO writes, both with the SERVICE-ROLE key and both
 * server-side (the key never reaches the browser):
 *
 *   1. the bytes → Supabase Storage, bucket `media` — created by hand in
 *      the dashboard (public, jpg/png/webp, 5 MB limit) — through the
 *      Storage REST API. Plain `fetch`, no new npm dependency;
 *   2. the row   → the `media` table, which is what the admin lists and
 *      what survives a redeploy.
 *
 * Deletion is the mirror: object first, then the row. The stored `url` is
 * the public object URL, which doubles as the way back to the object
 * path — legacy mock rows (`/media/…`) have no real object, so only their
 * row is removed.
 *
 * RLS: `media` has RLS enabled with no policies and no anon/authenticated
 * GRANT (see 20261022190000_grants.sql) — unreachable except through
 * this service-role path.
 */

const BUCKET = 'media';

/** Mirrors MEDIA_RULES in src/data/mock/media.ts and the bucket config
 *  the owner created in the dashboard — checked here because the client
 *  check is only a courtesy. */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_BYTES = 5 * 1024 * 1024;

interface MediaRow {
  id: string;
  filename: string;
  url: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  size_bytes: number;
  created_at: string;
}

const MEDIA_COLUMNS = 'id,filename,url,mime_type,size_bytes,created_at';

function toItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    filename: row.filename,
    url: row.url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

/** Bad input the caller can show verbatim (route turns it into HTTP 400). */
export class MediaValidationError extends Error {}

/** The library, newest first. */
export async function loadMedia(): Promise<MediaItem[]> {
  const rows = await rest<MediaRow[]>(`media?select=${MEDIA_COLUMNS}&order=created_at.desc`);
  return rows.map(toItem);
}

/**
 * Object name: sanitized basename prefixed with a timestamp. The
 * sanitisation strips anything outside [a-z0-9-] (so a filename can't
 * escape the bucket or smuggle HTML), the timestamp keeps two files
 * both called "photo.jpg" from silently overwriting each other's URL.
 */
function objectName(filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const base =
    filename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'image';
  return `${Date.now()}-${base}.${ext}`;
}

/** One batch is at most this many files (both upload surfaces). */
export const MAX_BATCH = 6;

/**
 * The rules for ONE file — mime, extension, size. Throws
 * MediaValidationError with wording the UI can show verbatim.
 */
function validateMediaFile(file: File): void {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_MIME.has(file.type) || !ALLOWED_EXT.has(ext)) {
    throw new MediaValidationError(
      `“${file.name}” is not a jpg, png or webp (got ${file.type || 'no MIME type'}).`,
    );
  }
  if (file.size === 0) {
    throw new MediaValidationError(`“${file.name}” is empty.`);
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new MediaValidationError(`“${file.name}” is ${mb} MB — the limit is 5 MB.`);
  }
}

/**
 * Store the bytes in Storage, insert the `media` row, return the item.
 * If the row insert fails the object is rolled back, so a half-state
 * (bytes with no library entry) can't linger.
 */
export async function uploadMedia(file: File): Promise<MediaItem> {
  const problem = configProblem();
  if (problem) throw new Error(problem);

  validateMediaFile(file);

  const name = objectName(file.name);
  const upload = await supabaseFetch(`/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
    body: file,
  });
  if (!upload.ok) {
    const detail = (await upload.text()).slice(0, 300);
    throw new Error(`Storage upload → HTTP ${upload.status}: ${detail}`);
  }

  const row: MediaRow = {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    url: `${supabaseOrigin()}/storage/v1/object/public/${BUCKET}/${name}`,
    mime_type: file.type as MediaRow['mime_type'],
    size_bytes: file.size,
    created_at: new Date().toISOString(),
  };

  try {
    await rest(`media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
  } catch (error) {
    // Roll the object back so a failed row insert leaves nothing behind.
    await supabaseFetch(`/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).catch(() => undefined);
    throw error;
  }

  return toItem(row);
}

/**
 * A batch of 1–MAX_BATCH files: every file is validated FIRST (a bad
 * file in the middle of a drop rejects the whole batch before any
 * write), then each uploads through the single-file path. If one fails
 * mid-batch, the already-stored items are rolled back (object + row) so
 * a failed batch leaves nothing behind — same all-or-nothing standard
 * as a single upload.
 */
export async function uploadMediaBatch(files: File[]): Promise<MediaItem[]> {
  const problem = configProblem();
  if (problem) throw new Error(problem);

  if (files.length === 0) {
    throw new MediaValidationError('No files in the upload.');
  }
  if (files.length > MAX_BATCH) {
    throw new MediaValidationError(
      `${files.length} files in one drop — the limit is ${MAX_BATCH} per batch.`,
    );
  }
  for (const file of files) validateMediaFile(file);

  const stored: MediaItem[] = [];
  try {
    for (const file of files) {
      stored.push(await uploadMedia(file));
    }
  } catch (error) {
    // Roll back what this batch already stored; the rethrow reports the
    // real failure, and the rollback is best-effort by design.
    for (const item of stored) {
      await deleteMedia(item.id).catch(() => undefined);
    }
    throw error;
  }
  return stored;
}

/**
 * Remove the object, then the row. Returns false when the id doesn't
 * exist. A missing object (404) is not an error — the row still goes.
 */
export async function deleteMedia(id: string): Promise<boolean> {
  const rows = await rest<MediaRow[]>(
    `media?select=${MEDIA_COLUMNS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  if (rows.length === 0) return false;

  const url = rows[0].url;
  const prefix = `${supabaseOrigin()}/storage/v1/object/public/${BUCKET}/`;
  if (url.startsWith(prefix)) {
    const objectPath = url.slice(prefix.length);
    // Only ever touch paths inside this bucket (no traversal).
    if (objectPath && !objectPath.includes('..') && !objectPath.startsWith('/')) {
      const del = await supabaseFetch(
        `/storage/v1/object/${BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
        { method: 'DELETE' },
      );
      if (!del.ok && del.status !== 404) {
        const detail = (await del.text()).slice(0, 300);
        throw new Error(`Storage delete → HTTP ${del.status}: ${detail}`);
      }
    }
  }

  await rest(`media?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return true;
}
