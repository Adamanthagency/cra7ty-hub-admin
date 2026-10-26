import type {
  Category,
  ContentListItem,
  PageKey,
  PageSection,
  Revision,
  SiteSettings,
} from '@/lib/types';
import type { LiveContent, PublishPayload } from '@/lib/publish-api';

/**
 * Server-only Supabase access for the admin API routes (Stage 4).
 *
 * Uses the SERVICE-ROLE key: these routes read/write tables RLS denies to
 * anon (revisions have no public policy; every content table is written
 * only through `apply_publish`). The key lives in the server env and is
 * never sent to the browser — the client talks to /admin/api/* only.
 *
 * apply_publish (supabase/migrations/20261022180000_init_backend.sql):
 * delete-all + reinsert in ONE transaction, plus the revision insert —
 * so the payload must be the COMPLETE published state. The service key's
 * presence is the only gate; the SQL function is additionally locked to
 * service_role EXECUTE.
 */

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
/** Server-only alias; the seed script writes SUPABASE_URL, so accept it. */
const ALIAS_URL = process.env.SUPABASE_URL;
const SUPABASE_URL = PUBLIC_URL ?? ALIAS_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Which env var name supplied the URL — reported by diagnostics. */
export function urlEnvName(): 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_URL' | null {
  if (PUBLIC_URL) return 'NEXT_PUBLIC_SUPABASE_URL';
  if (ALIAS_URL) return 'SUPABASE_URL';
  return null;
}

/**
 * The exact reason the store is unusable, naming the literal env var —
 * or null when it is ready. This is what the API routes and
 * /admin/api/diagnostics show, so a misconfigured deploy is diagnosable
 * from the UI instead of guessed at in a dashboard.
 */
export function configProblem(): string | null {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length === 0) return null;
  return `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set on this server.`;
}

/** False → the API routes answer 503 and the workbench stays local. */
export function storeConfigured(): boolean {
  return configProblem() === null;
}

/**
 * One cheap authenticated read, for /admin/api/diagnostics. Reports only
 * the HTTP status and PostgREST's message — never the URL or the key.
 */
export async function probeConnection(): Promise<{
  ok: boolean;
  httpStatus: number | null;
  detail: string;
}> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/content_values?select=key&limit=1`,
      {
        cache: 'no-store',
        headers: {
          apikey: SERVICE_KEY!,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      },
    );
    const body = (await response.text()).slice(0, 200);
    return {
      ok: response.ok,
      httpStatus: response.status,
      detail: response.ok ? 'authenticated read succeeded' : body || `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, httpStatus: null, detail: (error as Error).message.slice(0, 200) };
  }
}

/** The Supabase project origin, for non-PostgREST paths (Storage). */
export function supabaseOrigin(): string | null {
  return SUPABASE_URL ?? null;
}

/** One authenticated call to any Supabase API path (e.g. /storage/v1/…).
 *  Headers from `init` win, so callers can set Content-Type to a file's
 *  own MIME type. No body or content type is assumed — unlike `rest()`. */
export function supabaseFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
}

/** One authenticated PostgREST call. Exported for catalog-store, which
 *  speaks to the products/posts/media tables through the same service-role
 *  connection and error surface. */
export async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase ${path} → HTTP ${response.status}: ${detail}`);
  }
  // apply_publish returns void → PostgREST answers 204 with no body
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ------------------------------------------------------------------ */
/* settings: the admin holds a nested object; the DB holds flat keys   */
/* (siteName, tagline, …, seo.home, seo.shop, …).                      */
/* ------------------------------------------------------------------ */

export function settingsToRows(settings: SiteSettings): Record<string, unknown> {
  const rows: Record<string, unknown> = {
    siteName: settings.siteName,
    tagline: settings.tagline,
    whatsappNumber: settings.whatsappNumber,
    whatsappDisplay: settings.whatsappDisplay,
    email: settings.email,
    address: settings.address,
    instagram: settings.instagram,
    freeDeliveryOver: settings.freeDeliveryOver,
  };
  for (const [page, seo] of Object.entries(settings.seo)) {
    if (seo) rows[`seo.${page}`] = seo;
  }
  return rows;
}

export function settingsFromRows(
  rows: { key: string; value: unknown }[],
): SiteSettings {
  const settings: SiteSettings = {
    siteName: '',
    tagline: '',
    whatsappNumber: '',
    whatsappDisplay: '',
    email: '',
    address: '',
    instagram: '',
    freeDeliveryOver: 0,
    seo: {},
  };
  for (const row of rows) {
    if (row.key.startsWith('seo.')) {
      const page = row.key.slice('seo.'.length) as PageKey;
      settings.seo[page] = row.value as SiteSettings['seo'][typeof page];
    } else if (row.key in settings) {
      (settings as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return settings;
}

/* ------------------------------------------------------------------ */
/* load: the four content tables + revisions → the workbench shape     */
/* ------------------------------------------------------------------ */

interface ListRow {
  list_key: string;
  item_id: string;
  position: number;
  fields: Record<string, string | number | boolean>;
}

interface SectionRow {
  id: string;
  page: PageKey;
  key: string;
  label: string;
  position: number;
  visible: boolean;
  variant: string | null;
  variants: string[] | null;
  shared_from: PageKey | null;
}

interface RevisionRow {
  id: string;
  at: string;
  author: string;
  changes: Revision['changes'];
}

/** model/count are storefront-owned and deliberately not selected. */
interface CategoryRow {
  id: string;
  index_label: string;
  name: string;
  blurb: string;
  position: number;
}

export async function loadLiveContent(): Promise<LiveContent> {
  const [valueRows, listRows, sectionRows, settingRows, categoryRows, revisionRows] =
    await Promise.all([
      rest<{ key: string; value: string | number }[]>(
        'content_values?select=key,value&order=key.asc',
      ),
      rest<ListRow[]>(
        'content_list_items?select=list_key,item_id,position,fields&order=position.asc',
      ),
      rest<SectionRow[]>(
        'page_sections?select=id,page,key,label,position,visible,variant,variants,shared_from&order=page.asc,position.asc',
      ),
      rest<{ key: string; value: unknown }[]>(
        'site_settings?select=key,value&order=key.asc',
      ),
      rest<CategoryRow[]>(
        'categories?select=id,index_label,name,blurb,position&order=position.asc',
      ),
      rest<RevisionRow[]>('revisions?select=id,at,author,changes&order=at.desc'),
    ]);

  const values: LiveContent['values'] = {};
  for (const row of valueRows) values[row.key] = row.value;

  const lists: LiveContent['lists'] = {};
  for (const row of listRows) {
    (lists[row.list_key] ??= []).push({ id: row.item_id, fields: row.fields });
  }

  const categories: Category[] = categoryRows.map((row) => ({
    id: row.id,
    index: row.index_label,
    name: row.name,
    blurb: row.blurb,
  }));

  const sections: PageSection[] = sectionRows.map((row) => ({
    id: row.id,
    page: row.page,
    key: row.key,
    label: row.label,
    position: row.position,
    visible: row.visible,
    ...(row.variant ? { variant: row.variant } : {}),
    ...(row.variants ? { variants: row.variants } : {}),
    ...(row.shared_from ? { sharedFrom: row.shared_from } : {}),
  }));

  const revisions: Revision[] = revisionRows.map((row) => ({
    id: row.id,
    at: row.at,
    author: row.author,
    changes: row.changes ?? [],
  }));

  return {
    values,
    lists,
    sections,
    settings: settingsFromRows(settingRows),
    categories,
    revisions,
  };
}

/* ------------------------------------------------------------------ */
/* save: the complete next state through apply_publish (one txn)       */
/* ------------------------------------------------------------------ */

export async function savePublish(payload: PublishPayload): Promise<void> {
  const p_lists = Object.fromEntries(
    Object.entries(payload.lists).map(([listKey, items]) => [
      listKey,
      items.map((item: ContentListItem, index: number) => ({
        id: item.id,
        position: index,
        fields: item.fields,
      })),
    ]),
  );

  // Categories travel as an ordered array; position is the array order.
  const p_categories = payload.categories.map((category, index) => ({
    id: category.id,
    position: index + 1,
    index_label: category.index,
    name: category.name,
    blurb: category.blurb,
  }));

  const p_sections = payload.sections.map((section) => ({
    id: section.id,
    page: section.page,
    key: section.key,
    label: section.label,
    position: section.position,
    visible: section.visible,
    variant: section.variant ?? null,
    variants: section.variants ?? null,
    shared_from: section.sharedFrom ?? null,
  }));

  await rest('rpc/apply_publish', {
    method: 'POST',
    body: JSON.stringify({
      p_values: payload.values,
      p_lists,
      p_sections,
      p_settings: settingsToRows(payload.settings),
      p_categories,
      p_revision: {
        id: payload.revision.id,
        at: payload.revision.at,
        author: payload.revision.author,
        changes: payload.revision.changes,
      },
    }),
  });
}
