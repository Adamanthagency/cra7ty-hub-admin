/**
 * LIVE E2E for the instant-publish stage (mandatory photos + on-demand
 * revalidation), against the deployed admin (Vercel protection bypass
 * via .verify/.bypass) and https://www.cra7tyhub.com.
 *
 *   node .verify/e2e-instant.mjs
 *
 * Measures, with timestamps: content / product / post publish → live
 * storefront reflects it (expect seconds; the old behaviour was up to
 * 300s). Verifies the revalidate endpoint's auth, the live multi-file
 * upload, and cleans up EVERYTHING it writes: product + post rows,
 * media rows + Storage objects, the content value reverted
 * byte-for-byte, and both probe revisions deleted. Every write printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'https://cra7ty-hub-admin.vercel.app';
const SHOP = 'https://www.cra7tyhub.com';
const BYPASS = fs.readFileSync(path.resolve('.verify/.bypass'), 'utf8').trim();

const localEnv = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SECRET = localEnv.REVALIDATE_SECRET;
const SUPA = localEnv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = localEnv.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

async function get(url, opts = {}, tries = 8) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { redirect: 'manual', ...opts });
    } catch (e) {
      last = e;
      await sleep(1500);
    }
  }
  throw last;
}

/** One call to the deployed admin: bypass header + optional session. */
async function vcall(url, { method = 'GET', headers = {}, body, form } = {}) {
  const h = { 'x-vercel-protection-bypass': BYPASS, ...headers };
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    h['Content-Type'] = h['Content-Type'] ?? 'application/json';
    payload = body;
  }
  const res = await get(url, { method, headers: h, body: payload });
  const setCookie = res.headers.get('set-cookie');
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html/empty */
  }
  return { status: res.status, json, text, setCookie: setCookie ? setCookie.split(';')[0] : null };
}

/** Service-role REST for probe cleanup (revisions) — same as e2e-local. */
async function db(path, init = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* empty */
  }
  return { status: res.status, json, text };
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => `${f.name} (${f.detail ?? ''})`).join(' | '));
    process.exit(1);
  }
}

const cb = (url) => `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`;

/** Poll until `needle` APPEARS; report ms since sinceMs. */
async function pollFor(url, needle, sinceMs, tries = 30, gapMs = 1000) {
  for (let i = 1; i <= tries; i++) {
    const res = await get(cb(url));
    const text = await res.text();
    if (text.includes(needle)) {
      return { found: true, ms: Date.now() - sinceMs, attempts: i };
    }
    await sleep(gapMs);
  }
  return { found: false, ms: null, attempts: tries };
}

/** Poll until `needle` is GONE; returns {gone, ms, attempts}. */
async function pollUntilGone(url, needle, sinceMs, tries = 30, gapMs = 1000) {
  for (let i = 1; i <= tries; i++) {
    const res = await get(cb(url));
    const text = await res.text();
    if (!text.includes(needle)) {
      return { gone: true, ms: Date.now() - sinceMs, attempts: i };
    }
    await sleep(gapMs);
  }
  return { gone: false, ms: null, attempts: tries };
}

let cookie = null;
async function login() {
  try {
    cookie = await adminLogin(ADMIN);
    check('live admin: login sets session cookie', Boolean(cookie));
  } catch (e) {
    check('live admin: login sets session cookie', false, e.message);
  }
}
const admin = (url, opts = {}) =>
  vcall(`${ADMIN}${url}`, {
    ...opts,
    headers: { ...(opts.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) },
  });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  /* ---------------- 1. endpoint auth (live storefront) ---------------- */
  console.log('— live /api/revalidate auth —');
  const noAuth = await get(`${SHOP}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['/shop'] }),
  });
  check('live revalidate: no token → 401', noAuth.status === 401, `HTTP ${noAuth.status}`);

  const badAuth = await get(`${SHOP}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nope' },
    body: JSON.stringify({ paths: ['/shop'] }),
  });
  check('live revalidate: wrong token → 401', badAuth.status === 401, `HTTP ${badAuth.status}`);

  const good = await get(`${SHOP}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ paths: ['/shop'], tags: ['db:products'] }),
  });
  const goodJson = await good.json().catch(() => null);
  check(
    'live revalidate: valid token → 200 revalidated:true',
    good.status === 200 && goodJson?.revalidated === true,
    `HTTP ${good.status}`,
  );

  await login();

  /* ---------------- 2. content publish → live in seconds ---------------- */
  console.log('\n— content change (shop header title) —');
  const KEY = 'shop.header.title.1';
  const live0 = await admin('/admin/api/content');
  const originalValue = live0.json?.values?.[KEY];
  if (typeof originalValue !== 'string') {
    check('content: probe key exists in live values', false, `key=${KEY}`);
    throw new Error('probe key missing');
  }
  const MARKER = 'INSTANTPROBE';
  const contentPayload = (value, id) => ({
    values: { ...live0.json.values, [KEY]: value },
    lists: live0.json.lists,
    sections: live0.json.sections,
    settings: live0.json.settings,
    categories: live0.json.categories,
    revision: {
      id,
      at: now(),
      author: 'E2E',
      changes: [{ key: KEY, label: 'Shop header title', from: originalValue, to: value }],
    },
  });

  try {
    const tResp0 = Date.now();
    const pub1 = await admin('/admin/api/publish', {
      method: 'POST',
      body: JSON.stringify(contentPayload(MARKER, `rev-e2e-inst-c1-${Date.now()}`)),
    });
    const tResp = Date.now();
    check(
      'content: publish → 200 + revalidate.ok',
      pub1.status === 200 && pub1.json?.revalidate?.ok === true,
      `HTTP ${pub1.status} revalidate=${JSON.stringify(pub1.json?.revalidate)}`,
    );
    console.log(
      `  WRITE  content publish #1 (marker "${MARKER}") at ${now()} — server revalidate ${pub1.json?.revalidate?.ms ?? '?'}ms (round trip ${tResp - tResp0}ms)`,
    );
    const seen = await pollFor(`${SHOP}/shop`, MARKER, tResp);
    check(
      'content: live /shop shows the change within seconds',
      seen.found,
      seen.found
        ? `visible ${seen.ms} ms after publish response (polls=${seen.attempts})`
        : `not visible after ${seen.attempts} polls`,
    );
  } finally {
    const t1 = Date.now();
    const pub2 = await admin('/admin/api/publish', {
      method: 'POST',
      body: JSON.stringify(contentPayload(originalValue, `rev-e2e-inst-c2-${Date.now()}`)),
    });
    console.log(`  WRITE  content publish #2 (revert) at ${now()} — HTTP ${pub2.status}`);
    const gone = await pollUntilGone(`${SHOP}/shop`, MARKER, t1);
    check(
      'content: revert clears the marker from live /shop within seconds',
      gone.gone,
      gone.gone ? `cleared ${gone.ms} ms after revert response (polls=${gone.attempts})` : `marker still present after ${gone.attempts} polls`,
    );
    const live1 = await admin('/admin/api/content');
    check(
      'content: value restored byte-for-byte',
      live1.json?.values?.[KEY] === originalValue,
      `now=${JSON.stringify(live1.json?.values?.[KEY])}`,
    );
    const revs = await db('revisions?select=id&author=eq.E2E');
    for (const r of revs.json ?? []) {
      await db(`revisions?id=eq.${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      console.log(`  DELETE probe revision: ${r.id}`);
    }
    const left = await db('revisions?select=id&author=eq.E2E');
    check('probe revisions removed', (left.json ?? []).length === 0, `${(left.json ?? []).length} left`);
  }

  /* ---------------- 3. product publish → live in seconds ---------------- */
  console.log('\n— product with photo (live batch upload) —');
  const batch = new FormData();
  batch.append('files', new Blob([PNG], { type: 'image/png' }), 'e2e-instant-1.png');
  batch.append('files', new Blob([PNG], { type: 'image/png' }), 'e2e-instant-2.png');
  const up = await admin('/admin/api/media', { method: 'POST', form: batch });
  const items = up.json?.items ?? [];
  check(
    'live media: batch of 2 → 201 items[2]',
    up.status === 201 && items.length === 2,
    `HTTP ${up.status} items=${items.length}`,
  );
  items.forEach((i) => console.log(`  WRITE  media row + Storage object: ${i.id}`));
  const photoUrl = items[0]?.url;

  const stamp = Date.now();
  const idLive = `product-e2e-inst-${stamp}`;
  const slugLive = `e2e-inst-${stamp}`;
  const product = {
    id: idLive,
    slug: slugLive,
    name: 'E2E INSTANT PROBE',
    description: 'Instant-publish timing probe — deleted by the same script.',
    category: 'origami',
    price: 777,
    model: 'crane',
    detail: ['Probe paragraph.'],
    specs: [{ label: 'Probe', value: 'yes' }],
    stock: 1,
    status: 'active',
    variants: [],
    tags: [],
    images: photoUrl ? [photoUrl] : [],
    position: 0,
    updatedAt: now(),
  };
  try {
    const tResp0 = Date.now();
    const w = await admin('/admin/api/products', { method: 'POST', body: JSON.stringify(product) });
    const tResp = Date.now();
    check(
      'product: active with photo → 200 + revalidate.ok',
      w.status === 200 && w.json?.revalidate?.ok === true,
      `HTTP ${w.status} revalidate=${JSON.stringify(w.json?.revalidate)}`,
    );
    console.log(
      `  WRITE  products row (active): ${idLive} at ${now()} — server revalidate ${w.json?.revalidate?.ms ?? '?'}ms (round trip ${tResp - tResp0}ms)`,
    );
    const seen = await pollFor(`${SHOP}/shop`, 'E2E INSTANT PROBE', tResp);
    check(
      'product: live /shop shows it within seconds',
      seen.found,
      seen.found
        ? `visible ${seen.ms} ms after save response (polls=${seen.attempts})`
        : `not visible after ${seen.attempts} polls`,
    );
    const detail = await get(`${SHOP}/products/${slugLive}`);
    const dtext = await detail.text();
    check(
      'product: live detail page renders the photo <img>',
      detail.status === 200 && Boolean(photoUrl) && dtext.includes(photoUrl),
      `HTTP ${detail.status}`,
    );
  } finally {
    const t1 = Date.now();
    const d = await admin(`/admin/api/products?id=${idLive}`, { method: 'DELETE' });
    check(
      'product: cleanup DELETE → 200 + revalidate.ok',
      d.status === 200 && d.json?.revalidate?.ok === true,
      `HTTP ${d.status}`,
    );
    console.log(`  DELETE products row: ${idLive} at ${now()}`);
    const gone = await pollUntilGone(`${SHOP}/shop`, 'E2E INSTANT PROBE', t1);
    check(
      'product: live /shop drops it within seconds after delete',
      gone.gone,
      gone.gone ? `gone ${gone.ms} ms after delete response (polls=${gone.attempts})` : `still present after ${gone.attempts} polls`,
    );
    for (const i of items) {
      const dm = await admin(`/admin/api/media?id=${i.id}`, { method: 'DELETE' });
      check(`cleanup: media ${i.filename} deleted`, dm.status === 200, `HTTP ${dm.status}`);
      console.log(`  DELETE media row + Storage object: ${i.id}`);
    }
  }

  /* ---------------- 4. post publish → live in seconds (+ XSS re-check) ---------------- */
  console.log('\n— blog post (published) —');
  const XSS = '<script>alert("xss")</script>';
  const stamp2 = Date.now();
  const idPost = `post-e2e-inst-${stamp2}`;
  const slugPost = `e2e-inst-${stamp2}`;
  const post = {
    id: idPost,
    title: 'E2E instant publish probe',
    titleLines: ['E2E instant publish probe'],
    standfirst: 'Temporary standfirst for the instant-publish timing test.',
    slug: slugPost,
    excerpt: `Timing probe excerpt with ${XSS} inside.`,
    content: `Opening paragraph with ${XSS} inside.\n\n## A heading\n\nClosing line.`,
    category: 'Studio practice',
    model: 'crane',
    date: '2026-10-25',
    minutes: 1,
    relatedProductIds: [],
    tags: ['e2e'],
    status: 'published',
    placeholder: false,
    coverUrl: null,
    publishedAt: '2026-10-25',
    updatedAt: now(),
  };
  try {
    const tResp0 = Date.now();
    const w = await admin('/admin/api/posts', { method: 'POST', body: JSON.stringify(post) });
    const tResp = Date.now();
    check(
      'post: publish → 200 + revalidate.ok',
      w.status === 200 && w.json?.revalidate?.ok === true,
      `HTTP ${w.status} revalidate=${JSON.stringify(w.json?.revalidate)}`,
    );
    console.log(
      `  WRITE  blog_posts row (published): ${idPost} at ${now()} — server revalidate ${w.json?.revalidate?.ms ?? '?'}ms (round trip ${tResp - tResp0}ms)`,
    );
    const seen = await pollFor(`${SHOP}/blog`, 'E2E instant publish probe', tResp);
    check(
      'post: live /blog lists it within seconds',
      seen.found,
      seen.found
        ? `visible ${seen.ms} ms after publish response (polls=${seen.attempts})`
        : `not visible after ${seen.attempts} polls`,
    );
    const detail = await get(`${SHOP}/blog/${slugPost}`);
    const dtext = await detail.text();
    check('post: live detail → 200', detail.status === 200, `HTTP ${detail.status}`);
    check(
      'post: XSS canary still renders as text (escaped)',
      dtext.includes('&lt;script&gt;') && !dtext.includes('<script>alert('),
      'escaped canary present, raw canary absent',
    );
  } finally {
    const t1 = Date.now();
    const d = await admin(`/admin/api/posts?id=${idPost}`, { method: 'DELETE' });
    check(
      'post: cleanup DELETE → 200 + revalidate.ok',
      d.status === 200 && d.json?.revalidate?.ok === true,
      `HTTP ${d.status}`,
    );
    console.log(`  DELETE blog_posts row: ${idPost} at ${now()}`);
    const gone = await pollUntilGone(`${SHOP}/blog`, 'E2E instant publish probe', t1);
    check(
      'post: live /blog drops it within seconds after delete',
      gone.gone,
      gone.gone ? `gone ${gone.ms} ms after delete response (polls=${gone.attempts})` : `still present after ${gone.attempts} polls`,
    );
    const d404 = await get(`${SHOP}/blog/${slugPost}`);
    check('post: detail now 404', d404.status === 404, `HTTP ${d404.status}`);
  }

  finish();
}

main().catch((error) => {
  console.error('SCRIPT ERROR:', error);
  process.exit(1);
});
