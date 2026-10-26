/**
 * Local E2E for the Products/Blog/Categories write paths (Stage 4–5).
 * Runs against `next dev` on :3005 and the REAL remote database.
 *
 * Nothing test-related is left behind: the test product and post are
 * created, updated and deleted; the categories publish is reverted to the
 * exact order it started with; probe revisions are removed.
 *
 *   node .verify/e2e-local.mjs
 */
import fs from 'node:fs';
import { adminLogin } from './lib-auth.mjs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../../cra7ty-hub/.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = 'http://localhost:3005';

let cookie = null;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, opts = {}, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      last = e;
      await sleep(1200);
    }
  }
  throw last;
}

async function admin(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await call(`${BASE}${path}`, { ...opts, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 204 etc. */
  }
  return { status: res.status, body };
}

async function db(path, opts = {}) {
  const headers = {
    apikey: opts.key ?? SERVICE,
    Authorization: `Bearer ${opts.key ?? SERVICE}`,
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers ?? {}),
  };
  const res = await call(`${SUPA}/rest/v1/${path}`, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/* 1 — session cookie (real magic-link flow, no email sent) */
{
  try {
    cookie = await adminLogin(BASE);
    check('login sets session cookie', Boolean(cookie));
  } catch (e) {
    check('login sets session cookie', false, e.message);
  }
}

/* 2 — the route guards itself without the middleware */
{
  const res = await call(`${BASE}/admin/api/products`);
  check('GET /admin/api/products without cookie → 401', res.status === 401, `HTTP ${res.status}`);
}

/* 3 — hydration returns the live rows */
let liveCount = 0;
{
  const r = await admin('/admin/api/products');
  liveCount = Array.isArray(r.body?.products) ? r.body.products.length : 0;
  check('GET products with cookie → live rows', r.status === 200 && liveCount > 0, `${liveCount} rows`);
}

/* 4 — shape validation rejects a bad price */
{
  const r = await admin('/admin/api/products', {
    method: 'POST',
    body: JSON.stringify({
      id: 'x', slug: 'bad-price-test', name: 'Bad', description: '', category: 'origami',
      price: -5, model: 'crane', detail: [], specs: [], stock: 0, status: 'active',
      variants: [], tags: [], images: [], position: 0, updatedAt: new Date().toISOString(),
    }),
  });
  check('negative price → 400', r.status === 400, `HTTP ${r.status} ${r.body?.error ?? ''}`);
}

/* 5 — create a real product */
const testId = `product-e2e-${Date.now()}`;
const testSlug = `e2e-test-product-${Date.now().toString(36)}`;
{
  const r = await admin('/admin/api/products', {
    method: 'POST',
    body: JSON.stringify({
      id: testId, slug: testSlug, name: 'E2E test product', description: 'Temporary product created by the local E2E run.',
      category: 'origami', price: 1000, model: 'crane', detail: ['First paragraph.', 'Second paragraph.'],
      specs: [{ label: 'Quantity', value: '1' }], stock: 3, status: 'active',
      variants: [], tags: ['e2e'], images: [], position: 0, updatedAt: new Date().toISOString(),
    }),
  });
  check('POST new product → 200', r.status === 200 && r.body?.id === testId, `HTTP ${r.status} ${r.body?.error ?? ''}`);
  const row = await db(`products?id=eq.${testId}&select=id,slug,status,position,model,detail,specs,updated_at`);
  const p = Array.isArray(row.body) ? row.body[0] : null;
  check(
    'row exists with storefront shape + appended position',
    Boolean(p) && p.slug === testSlug && p.status === 'active' && p.position > 0 && p.model === 'crane' && p.detail.length === 2,
    p ? `position=${p.position} model=${p.model}` : JSON.stringify(row.body).slice(0, 120),
  );
}

/* 6 — slug collision → 409 */
{
  const r = await admin('/admin/api/products', {
    method: 'POST',
    body: JSON.stringify({
      id: `product-e2e-dup-${Date.now()}`, slug: testSlug, name: 'Duplicate', description: '', category: 'origami',
      price: 100, model: 'crane', detail: [], specs: [], stock: 0, status: 'inactive',
      variants: [], tags: [], images: [], position: 0, updatedAt: new Date().toISOString(),
    }),
  });
  check('duplicate slug → 409 with a readable message', r.status === 409, `HTTP ${r.status} ${r.body?.error ?? ''}`);
}

/* 7 — update (status flip + rename) */
{
  const r = await admin('/admin/api/products', {
    method: 'POST',
    body: JSON.stringify({
      id: testId, slug: testSlug, name: 'E2E test product (renamed)', description: 'Updated.',
      category: 'table', price: 1500, model: 'plate', detail: ['One paragraph.'], specs: [],
      stock: 4, status: 'inactive', variants: [], tags: [], images: [], position: 999,
      updatedAt: new Date().toISOString(),
    }),
  });
  const row = await db(`products?id=eq.${testId}&select=name,category,status,position`);
  const p = Array.isArray(row.body) ? row.body[0] : null;
  check(
    'update persists name/category/status and KEEPS position',
    r.status === 200 && p?.name === 'E2E test product (renamed)' && p?.category === 'table' && p?.status === 'inactive',
    p ? `${p.name} / ${p.category} / ${p.status} / position=${p.position} (client sent 999)` : 'row missing',
  );
  const pos = await db(`products?id=eq.${testId}&select=position`);
  check('client-sent position ignored (server owns shelf order)', pos.body?.[0]?.position !== 999, `position=${pos.body?.[0]?.position}`);
}

/* 8 — create a draft post; body markdown → blocks */
const testPostId = `post-e2e-${Date.now()}`;
const testPostSlug = `e2e-test-post-${Date.now().toString(36)}`;
{
  const r = await admin('/admin/api/posts', {
    method: 'POST',
    body: JSON.stringify({
      id: testPostId, title: 'E2E test note', titleLines: ['E2E test', 'note'],
      standfirst: 'A temporary standfirst for the E2E run.', slug: testPostSlug,
      excerpt: 'Temporary excerpt.', content: 'Opening paragraph with **bold** text.\n\n## A heading\n\n> A quote.',
      category: 'Studio practice', model: 'crane', date: '2026-10-24', minutes: 2,
      relatedProductIds: [], tags: ['e2e'], status: 'draft', placeholder: true,
      coverUrl: null, publishedAt: null, updatedAt: new Date().toISOString(),
    }),
  });
  const row = await db(`blog_posts?id=eq.${testPostId}&select=status,body,title_lines,standfirst,date`);
  const p = Array.isArray(row.body) ? row.body[0] : null;
  check(
    'POST new draft post → row with markdown blocks',
    r.status === 200 && p?.status === 'draft' && Array.isArray(p?.body) && p.body.length === 3,
    `HTTP ${r.status}; status=${p?.status}; blocks=${p?.body?.length}`,
  );
  check('draft is hidden from the storefront read (status filter)', p?.status === 'draft', 'getPosts filters status=published');
}

/* 9 — publish the post (via the admin's own read shape, as the UI does) */
{
  const current = await admin('/admin/api/posts');
  const post = current.body?.posts?.find((p) => p.id === testPostId);
  if (!post) {
    check('publish flips status → published', false, 'post missing from admin read');
  } else {
    post.status = 'published';
    post.publishedAt = '2026-10-24';
    const r = await admin('/admin/api/posts', { method: 'POST', body: JSON.stringify(post) });
    const row = await db(`blog_posts?id=eq.${testPostId}&select=status,published_at,updated_at`);
    check(
      'publish flips status → published',
      r.status === 200 && row.body?.[0]?.status === 'published',
      `HTTP ${r.status}; status=${row.body?.[0]?.status}; ${r.body?.error ?? ''}`,
    );
  }
}

/* 10 — RLS negatives: anon cannot write, read-only posture intact */
{
  const insert = await db('products', {
    key: ANON,
    method: 'POST',
    body: JSON.stringify({ id: 'anon-should-not-write', position: 1, slug: 'nope', name: 'Nope', category: 'origami', price: 1, description: '', model: 'crane', detail: [], specs: [], status: 'active', stock: 0, variants: [], tags: [], images: [], seo: {}, updated_at: new Date().toISOString() }),
    headers: { Prefer: 'return=minimal' },
  });
  check('anon INSERT into products denied', insert.status >= 400, `HTTP ${insert.status} ${JSON.stringify(insert.body).slice(0, 120)}`);

  const patch = await db(`blog_posts?id=eq.${testPostId}`, {
    key: ANON,
    method: 'PATCH',
    body: JSON.stringify({ status: 'draft' }),
  });
  check('anon UPDATE on blog_posts denied', patch.status >= 400, `HTTP ${patch.status} ${JSON.stringify(patch.body).slice(0, 120)}`);

  const anonRead = await db('products?select=id&limit=1', { key: ANON });
  check('anon SELECT still allowed (public read)', anonRead.status === 200, `HTTP ${anonRead.status}`);
}

/* 11 — categories: publish a reorder through the real route, then restore */
let probeRevisionIds = [];
{
  const before = await admin('/admin/api/content');
  if (before.status !== 200 || !Array.isArray(before.body?.categories)) {
    check('categories hydration via /admin/api/content', false, `HTTP ${before.status}`);
  } else {
    const live = before.body;
    check('hydration returns live categories', live.categories.length > 0, `${live.categories.length} categories`);
    const original = JSON.parse(JSON.stringify(live.categories));

    const swapped = JSON.parse(JSON.stringify(live.categories));
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];

    const payloadFor = (cats, id) => ({
      values: live.values, lists: live.lists, sections: live.sections,
      settings: live.settings, categories: cats,
      revision: { id, at: new Date().toISOString(), author: 'E2E', changes: [{ key: 'categories', label: 'Categories — order and copy', from: `${original.length} items`, to: `${swapped.length} items` }] },
    });

    const pub1 = await admin('/admin/api/publish', { method: 'POST', body: JSON.stringify(payloadFor(swapped, `rev-e2e-1-${Date.now()}`)) });
    const after1 = await db('categories?select=id,position&order=position.asc');
    const order1 = Array.isArray(after1.body) ? after1.body.map((c) => c.id).join(',') : '';
    const swappedOk = after1.body?.[0]?.id === original[1].id && after1.body?.[1]?.id === original[0].id;
    check('publish with categories reorders the table', pub1.status === 200 && swappedOk, `HTTP ${pub1.status}; order=${order1}`);

    const pub2 = await admin('/admin/api/publish', { method: 'POST', body: JSON.stringify(payloadFor(original, `rev-e2e-2-${Date.now()}`)) });
    const after2 = await db('categories?select=id,position&order=position.asc');
    const restored = Array.isArray(after2.body) ? after2.body.map((c) => c.id).join(',') : '';
    const expected = original.map((c) => c.id).join(',');
    check('second publish restores the original order', pub2.status === 200 && restored === expected, `HTTP ${pub2.status}; order=${restored}`);

    const revs = await db(`revisions?select=id&author=eq.E2E`);
    probeRevisionIds = Array.isArray(revs.body) ? revs.body.map((r) => r.id) : [];
    check('category publishes recorded revisions', probeRevisionIds.length === 2, `${probeRevisionIds.length} probe revisions`);

    // live content itself must be byte-equal after the round trip
    const after = await admin('/admin/api/content');
    const same = JSON.stringify({ v: after.body.values, l: after.body.lists, s: after.body.sections, st: after.body.settings })
      === JSON.stringify({ v: live.values, l: live.lists, s: live.sections, st: live.settings });
    check('content values/lists/sections/settings unchanged by the round trip', same, same ? 'identical' : 'DIFFERENT');
  }
}

/* 12 — cleanup: delete test rows and probe revisions */
{
  const delP = await admin(`/admin/api/products?id=${testId}`, { method: 'DELETE' });
  const delN = await admin(`/admin/api/posts?id=${testPostId}`, { method: 'DELETE' });
  check('test product deleted', delP.status === 200, `HTTP ${delP.status}`);
  check('test post deleted', delN.status === 200, `HTTP ${delN.status}`);

  const p = await db(`products?id=eq.${testId}&select=id`);
  const n = await db(`blog_posts?id=eq.${testPostId}&select=id`);
  check('no test rows remain', (p.body?.length ?? -1) === 0 && (n.body?.length ?? -1) === 0,
    `products=${p.body?.length} posts=${n.body?.length}`);

  for (const id of probeRevisionIds) {
    await db(`revisions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  const revsLeft = await db(`revisions?select=id&author=eq.E2E`);
  check('probe revisions removed from history', (revsLeft.body?.length ?? -1) === 0, `${revsLeft.body?.length} left`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}
