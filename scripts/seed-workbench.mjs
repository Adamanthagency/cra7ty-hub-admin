#!/usr/bin/env node
/**
 * seed-workbench.mjs — one-time (idempotent, safe to re-run) seed of the
 * workbench tables from the admin's own mock data.
 *
 * Writes: content_values, content_list_items, page_sections, site_settings,
 * revisions. Upserts by primary key only — never deletes a row it does not
 * own. Deliberately skips categories/products/blog_posts: the storefront
 * seed (scripts/seed-catalog.mjs in cra7ty-hub) owns those, because the
 * DB rows carry storefront shapes (model, counts, richer post fields).
 *
 * Credentials: SUPABASE_URL (falls back to NEXT_PUBLIC_SUPABASE_URL —
 * it is public) + SUPABASE_SERVICE_ROLE_KEY from ../.env.local.
 * Server-side script only. The service-role key is never logged, never
 * printed, and is sent only to this project's own PostgREST endpoint.
 *
 * Run:  node scripts/seed-workbench.mjs
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Node's built-in env loading — no dotenv dependency.
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local'));
} catch {
  // missing file surfaces as the var check below
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (expected in .env.local). Nothing written.'
  );
  process.exit(1);
}

// The mocks are TypeScript with type-only imports; Node's native type
// stripping erases those at load time, so the @/ alias never resolves.
const { fieldSeed, listSeed } = await import('../src/data/mock/content.ts');
const { pageSections } = await import('../src/data/mock/pages.ts');
const { settings } = await import('../src/data/mock/settings.ts');
const { revisions } = await import('../src/data/mock/revisions.ts');

async function upsert(table, rows) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const back = await res.json();
  console.log(`${table}: ${back.length} rows`);
}

/* content_values — one row per ContentField key. value is jsonb: a JSON
 * string or number, matching ValueMap (string | number). */
await upsert(
  'content_values',
  Object.entries(fieldSeed).map(([key, value]) => ({ key, value }))
);

/* content_list_items — position = array order in the mock (the admin's
 * canonical order); fields is the item's Record<string, string|number|boolean>. */
const listRows = [];
for (const [listKey, list] of Object.entries(listSeed)) {
  list.items.forEach((item, i) => {
    listRows.push({ list_key: listKey, item_id: item.id, position: i, fields: item.fields });
  });
}
await upsert('content_list_items', listRows);

/* page_sections — PageSection verbatim, camelCase → snake_case. */
await upsert(
  'page_sections',
  pageSections.map((s) => ({
    id: s.id,
    page: s.page,
    key: s.key,
    label: s.label,
    position: s.position,
    visible: s.visible,
    variant: s.variant ?? null,
    variants: s.variants ?? null,
    shared_from: s.sharedFrom ?? null,
  }))
);

/* site_settings — one row per scalar key; seo per page as one jsonb row
 * under `seo.<page>` (title/description/placeholder). */
const settingRows = [
  ['siteName', settings.siteName],
  ['tagline', settings.tagline],
  ['whatsappNumber', settings.whatsappNumber],
  ['whatsappDisplay', settings.whatsappDisplay],
  ['email', settings.email],
  ['address', settings.address],
  ['instagram', settings.instagram],
  ['freeDeliveryOver', settings.freeDeliveryOver],
  ...Object.entries(settings.seo).map(([page, seo]) => [`seo.${page}`, seo]),
].map(([key, value]) => ({ key, value }));
await upsert('site_settings', settingRows);

/* revisions — the two seeded history entries, so /admin/history has real
 * rows on first load. ISO strings become timestamptz server-side. */
await upsert(
  'revisions',
  revisions.map((r) => ({ id: r.id, at: r.at, author: r.author, changes: r.changes }))
);

console.log('seed-workbench: done');
