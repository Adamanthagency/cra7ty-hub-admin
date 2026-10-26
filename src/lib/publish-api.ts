import type {
  Category,
  ContentListItem,
  MediaItem,
  PageSection,
  Revision,
  SiteSettings,
} from '@/lib/types';

/**
 * The admin's wire to the live backend (Stage 4 of the backend wiring).
 *
 * Every write goes through POST /admin/api/publish, which calls
 * Supabase's `apply_publish` SQL function with the service-role key — one
 * atomic transaction for the whole published state (full-replace
 * semantics: the payload IS the complete published state, so removed keys
 * vanish instead of lingering as drift). The service key never reaches the
 * browser: the route holds it server-side.
 *
 * GET /admin/api/content hydrates the workbench from the same tables, so
 * the admin always edits what the storefront serves. When the server is
 * unconfigured or unreachable, both calls fail loudly and the workbench
 * keeps its local seed — it never pretends a publish succeeded.
 */

export type ValueMap = Record<string, string | number>;
export type ListMap = Record<string, ContentListItem[]>;

/**
 * How the instant-publish revalidation went, attached to every write
 * response so the editors can report it: ok means the storefront's
 * cache was purged on demand (seconds), a failure is a warning — the
 * storefront's kept 300s timer still bounds staleness.
 */
export interface RevalidateStatus {
  ok: boolean;
  /** round-trip time in ms */
  ms: number;
  /** human-readable failure reason when ok is false */
  error?: string;
}

/** The full live state, as the workbench holds it. */
export interface LiveContent {
  values: ValueMap;
  lists: ListMap;
  sections: PageSection[];
  settings: SiteSettings;
  /** the six fixed categories, in live order */
  categories: Category[];
  revisions: Revision[];
}

/** What /admin/api/publish accepts — the complete next published state
 *  plus the revision recording the change (the RPC inserts it).
 *
 * `categories` rides the same transaction: apply_publish updates the
 * fixed-id rows' editable columns (order, index, name, blurb) and never
 * touches model/count — those are storefront-owned. */
export interface PublishPayload {
  values: ValueMap;
  lists: ListMap;
  sections: PageSection[];
  settings: SiteSettings;
  categories: Category[];
  revision: Revision;
}

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function explain(status: number): string {
  if (status === 401) return 'your session expired — sign in again';
  if (status === 503)
    return 'Supabase is not configured on this server (the response names the missing variable)';
  if (status === 502) return 'Supabase rejected the request';
  return `unexpected response (${status})`;
}

/** Load the live state. Throws with a readable message on any failure. */
export async function fetchLiveContent(): Promise<LiveContent> {
  const response = await fetch('/admin/api/content', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  }
  return (await response.json()) as LiveContent;
}

/**
 * The media library (Stage 6): GET/POST/DELETE /admin/api/media.
 * The POST is a multipart upload — the bytes go to Supabase Storage
 * server-side; the browser never sees the service key.
 */
export async function fetchMedia(): Promise<MediaItem[]> {
  const response = await fetch('/admin/api/media', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  }
  return (await response.json()) as MediaItem[];
}

/**
 * Upload a batch of image files (1–6, one form field per file) → the
 * stored MediaItems, in input order. Throws with the server's validation
 * message on failure; the server stores all-or-nothing, so nothing is
 * added locally on failure either.
 */
export async function uploadMedia(files: File[]): Promise<MediaItem[]> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const response = await fetch('/admin/api/media', { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  }
  return ((await response.json()) as { items: MediaItem[] }).items;
}

/** Remove one item (Storage object + row). Throws on failure; the local
 *  library is only touched after the server confirms. */
export async function removeMedia(id: string): Promise<void> {
  const response = await fetch(`/admin/api/media?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  }
}

/**
 * Publish the full state. Throws on failure; the caller keeps drafts.
 * On success the response carries the storefront revalidation result.
 */
export async function postPublish(
  payload: PublishPayload,
): Promise<{ revisionId: string; revalidate?: RevalidateStatus }> {
  const response = await fetch('/admin/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  }
  return (await response.json()) as {
    revisionId: string;
    revalidate?: RevalidateStatus;
  };
}
