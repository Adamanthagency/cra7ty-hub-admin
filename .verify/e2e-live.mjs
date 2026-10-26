/**
 * LIVE E2E against the deployed admin (behind Vercel deployment
 * protection, accessed with the project's protection-bypass token from
 * .verify/.bypass) and https://www.cra7tyhub.com.
 *
 *   node .verify/e2e-live.mjs write   # login, diagnostics, media E2E,
 *                                     # anon negative tests, create the
 *                                     # test product + XSS post
 *   … wait >300s (one revalidation cycle) …
 *   node .verify/e2e-live.mjs check   # live storefront shows product +
 *                                     # post, XSS renders as text; then
 *                                     # delete both and verify DB absence
 *   … wait >330s …
 *   node .verify/e2e-live.mjs gone    # storefront shows neither
 *
 * Every write this script performs is reported in its output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'https://cra7ty-hub-admin.vercel.app';
const SHOP = 'https://www.cra7tyhub.com';
/** Vercel deployment-protection bypass (project settings; see .bypass). */
const BYPASS = fs.readFileSync(path.resolve('.verify/.bypass'), 'utf8').trim();
const STATE = path.resolve('.verify/e2e-live-state.json');
const PNG = path.resolve('.verify/test-live.png');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function vcall(url, { method = 'GET', headers = {}, body, contentType, form } = {}) {
  const h = { 'x-vercel-protection-bypass': BYPASS, ...headers };
  let payload;
  if (form) {
    payload = form; // FormData — fetch sets the multipart boundary
  } else if (body !== undefined) {
    h['Content-Type'] = contentType ?? 'application/json';
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
  return {
    status: res.status,
    json,
    text,
    setCookie: setCookie ? setCookie.split(';')[0] : null,
  };
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(
      'FAILED: ' + failed.map((f) => `${f.name} (${f.detail ?? ''})`).join(' | '),
    );
    process.exit(1);
  }
}

/* shared payloads (same shapes as the local E2E that passed 24/24) */
const productPayload = (id, slug, images = []) => ({
  id,
  slug,
  name: 'E2E LIVE PROBE',
  description: 'Live visibility probe with an XSS canary: <script>alert("xss")</script>',
  category: 'origami',
  price: 777,
  model: 'crane',
  detail: ['Probe paragraph one.'],
  specs: [{ label: 'Probe', value: 'yes' }],
  stock: 1,
  status: 'active',
  variants: [],
  tags: [],
  /* the mandatory-photo rule (active products need a photo) — callers pass
     a borrowed public URL from an EXISTING media row: no upload, nothing
     to clean */
  images,
  position: 0,
  updatedAt: new Date().toISOString(),
});

const XSS = '<script>alert("xss")</script>';
const postPayload = (id, slug) => ({
  id,
  title: 'E2E live XSS probe',
  titleLines: ['E2E live XSS probe', 'second line'],
  standfirst: 'A temporary standfirst for the live render test.',
  slug,
  excerpt: `Folio excerpt with ${XSS} inside.`,
  content: `Plain paragraph with ${XSS} inside.\n\n## <img src=x onerror=alert(1)>`,
  category: 'Studio practice',
  model: 'crane',
  /* Far-future date so the probe is ALWAYS the folio lead (getPosts orders
     date.desc; only the lead's excerpt is rendered on /blog). The folio
     escaping assertion below depends on the excerpt actually rendering —
     with a tied date the tie order was unspecified and the check flaked. */
  date: '2099-12-31',
  minutes: 1,
  relatedProductIds: [],
  tags: [],
  status: 'published',
  placeholder: true,
  coverUrl: null,
  publishedAt: '2026-10-24',
  updatedAt: new Date().toISOString(),
});

let cookie = null;
async function login() {
  try {
    cookie = await adminLogin(ADMIN);
    check('live admin: login sets session cookie', Boolean(cookie));
  } catch (e) {
    check('live admin: login sets session cookie', false, e.message);
  }
}
const admin = (p, opts = {}) =>
  vcall(`${ADMIN}${p}`, {
    ...opts,
    headers: { ...(opts.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) },
  });

/* ------------------------------------------------------------------ */

async function writePhase() {
  await login();

  /* diagnostics — booleans only, reported verbatim */
  const diag = await admin('/admin/api/diagnostics');
  check('GET /admin/api/diagnostics → 200', diag.status === 200, `HTTP ${diag.status}`);
  console.log('  diagnostics:', JSON.stringify(diag.json));

  /* guard: no cookie → 401 on the deployed media route */
  {
    const saved = cookie;
    cookie = null;
    const r = await admin('/admin/api/media');
    check('live GET media without cookie → 401', r.status === 401, `HTTP ${r.status}`);
    cookie = saved;
  }

  /* ---- media live E2E (every write reported) ---- */
  const form = new FormData();
  form.append(
    'file',
    new File([fs.readFileSync(PNG)], 'test-live.png', { type: 'image/png' }),
  );
  const up = await admin('/admin/api/media', { method: 'POST', form });
  /* batch shape: { items: [...] } since the multi-file upload stage */
  const upItem = up.json?.items?.[0] ?? (up.json?.id ? up.json : null);
  check(
    'live POST media (multipart) → 201 stored item',
    up.status === 201 && upItem?.url?.includes('/storage/v1/object/public/media/'),
    `HTTP ${up.status} ${JSON.stringify(up.json)?.slice(0, 200)}`,
  );
  console.log(
    `  WRITE  media row + object: ${upItem?.id ?? '(failed)'} → ${upItem?.url ?? '(none)'}`,
  );
  let mediaId = upItem?.id ?? null;
  if (upItem?.url) {
    const img = await get(upItem.url);
    check(
      'live public Storage URL serves the image',
      img.status === 200 && (img.headers.get('content-type') ?? '').includes('image/png'),
      `HTTP ${img.status} ${img.headers.get('content-type')}`,
    );
  }
  const list1 = await admin('/admin/api/media');
  const list1Rows = Array.isArray(list1.json)
    ? list1.json
    : Array.isArray(list1.json?.items) ? list1.json.items : [];
  check(
    'live media list contains it',
    list1.status === 200 && list1Rows.some((m) => m.id === mediaId),
    `${list1Rows.length} rows`,
  );
  /* Borrowed photo for the mandatory-photo rule: any EXISTING media row
     that isn't our probe (ours is deleted below) — nothing to clean up. */
  const donorPhotoUrl =
    list1Rows.find((m) => m.url && m.id !== mediaId)?.url ??
    'https://kdypdfyxtyoudpgotxmo.supabase.co/storage/v1/object/public/media/1792938170707-screenshot-2026-10-04-204329.png';

  /* cleanup: object + row both go (deleteMedia removes the Storage object too) */
  if (mediaId) {
    const del = await admin(`/admin/api/media?id=${mediaId}`, { method: 'DELETE' });
    check('cleanup: DELETE live media → 200', del.status === 200, `HTTP ${del.status} ${JSON.stringify(del.json)}`);
    console.log(`  DELETE media row + Storage object: ${mediaId}`);
    const again = await admin('/admin/api/media');
    const againRows = Array.isArray(again.json)
      ? again.json
      : Array.isArray(again.json?.items) ? again.json.items : [];
    check(
      'media probe gone after cleanup',
      again.status === 200 && !againRows.some((m) => m.id === mediaId),
      `HTTP ${again.status}`,
    );
    mediaId = null;
  }

  /* ---- anon negative tests (direct PostgREST, anon key) ---- */
  const anonEnv = Object.fromEntries(
    fs
      .readFileSync(path.resolve('../cra7ty-hub/.env.local'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  const SUPA = anonEnv.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = anonEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE = anonEnv.SUPABASE_SERVICE_ROLE_KEY;
  const anon = async (p, opts = {}) => {
    const res = await get(`${SUPA}/rest/v1/${p}`, {
      ...opts,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers ?? {}),
      },
    });
    return { status: res.status, text: (await res.text()).slice(0, 160) };
  };

  const anonInsertProduct = await anon('products', {
    method: 'POST',
    body: JSON.stringify({ id: 'anon-should-fail', slug: 'anon-should-fail' }),
  });
  check(
    'anon INSERT products → denied',
    anonInsertProduct.status >= 400,
    `HTTP ${anonInsertProduct.status} ${anonInsertProduct.text}`,
  );
  const anonInsertPost = await anon('blog_posts', {
    method: 'POST',
    body: JSON.stringify({ id: 'anon-should-fail' }),
  });
  check(
    'anon INSERT blog_posts → denied',
    anonInsertPost.status >= 400,
    `HTTP ${anonInsertPost.status} ${anonInsertPost.text}`,
  );
  const anonRpc = await anon('rpc/apply_publish', {
    method: 'POST',
    body: JSON.stringify({ p_payload: {}, p_revision: {} }),
  });
  check(
    'anon RPC apply_publish → denied',
    anonRpc.status >= 400,
    `HTTP ${anonRpc.status} ${anonRpc.text}`,
  );
  const anonDelete = await anon('products?id=eq.no-such-row', { method: 'DELETE' });
  check(
    'anon DELETE products → denied',
    anonDelete.status >= 400,
    `HTTP ${anonDelete.status} ${anonDelete.text}`,
  );
  const anonMedia = await anon('media?select=id&limit=1');
  check(
    'anon SELECT media (no grant) → denied',
    anonMedia.status >= 400,
    `HTTP ${anonMedia.status} ${anonMedia.text}`,
  );
  const anonRead = await anon('products?select=id&limit=1');
  check('anon SELECT products (public read) → 200', anonRead.status === 200, `HTTP ${anonRead.status}`);

  /* safety: if any anon write unexpectedly succeeded, nothing may linger */
  {
    const res = await get(`${SUPA}/rest/v1/products?id=eq.anon-should-fail`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    const rows = JSON.parse(await res.text());
    if (Array.isArray(rows) && rows.length > 0) {
      await get(`${SUPA}/rest/v1/products?id=eq.anon-should-fail`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      console.log('  WARNING: anon insert succeeded — probe row removed via service key');
    }
  }

  /* ---- live product + XSS post through the deployed admin API ---- */
  const stamp = Date.now().toString(36);
  const state = {
    productId: `product-live-${stamp}`,
    productSlug: `e2e-live-${stamp}`,
    postId: `post-live-${stamp}`,
    postSlug: `e2e-live-xss-${stamp}`,
    mediaId,
    writtenAt: Date.now(),
  };
  const w1 = await admin('/admin/api/products', {
    method: 'POST',
    body: JSON.stringify(
      productPayload(state.productId, state.productSlug, [donorPhotoUrl]),
    ),
  });
  check('live POST product → 200', w1.status === 200, `HTTP ${w1.status} ${JSON.stringify(w1.json)?.slice(0, 200)}`);
  console.log(`  WRITE  products row: ${state.productId} (slug ${state.productSlug})`);

  const w2 = await admin('/admin/api/posts', {
    method: 'POST',
    body: JSON.stringify(postPayload(state.postId, state.postSlug)),
  });
  check('live POST XSS post → 200', w2.status === 200, `HTTP ${w2.status} ${JSON.stringify(w2.json)?.slice(0, 200)}`);
  console.log(`  WRITE  blog_posts row: ${state.postId} (slug ${state.postSlug})`);

  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

  /* ---- product-photos E2E (own product, own media, cleaned here) ----
     A real photo attached to a real product must render as an <img> on
     the live shelf and product page (refetching until the ISR cycle
     lands it). Proves images → DB → storefront end to end. */
  {
    const stamp = Date.now();
    const photoId = `e2e-photo-${stamp}`;
    const photoSlug = `e2e-photo-${stamp}`;

    const form2 = new FormData();
    form2.append(
      'file',
      new File([fs.readFileSync(PNG)], 'photo-probe.png', { type: 'image/png' }),
    );
    const up2 = await admin('/admin/api/media', { method: 'POST', form: form2 });
    const up2Item = up2.json?.items?.[0] ?? (up2.json?.id ? up2.json : null);
    const photoUrl = up2Item?.url ?? null;
    check(
      'photos: live upload → 201 with Storage URL',
      up2.status === 201 && Boolean(photoUrl),
      `HTTP ${up2.status} ${photoUrl ?? ''}`,
    );

    const photoProduct = {
      ...productPayload(photoId, photoSlug),
      name: 'E2E PHOTO PROBE',
      images: photoUrl ? [photoUrl] : [],
    };
    const w3 = await admin('/admin/api/products', {
      method: 'POST',
      body: JSON.stringify(photoProduct),
    });
    check('photos: live POST product with image → 200', w3.status === 200, `HTTP ${w3.status}`);
    console.log(`  WRITE  products row with image: ${photoId} → ${photoUrl}`);

    if (photoUrl) {
      const rendered = await getTextWhen(
        `${SHOP}/products/${photoSlug}`,
        (t) => t.includes(photoUrl),
        6,
        15000,
      );
      check(
        'photos: live product page renders the <img>',
        rendered.status === 200 && rendered.text.includes(photoUrl),
        `refetches=${rendered.attempts}`,
      );
    } else {
      check('photos: live product page renders the <img>', false, 'no photo URL');
    }

    const d3 = await admin(`/admin/api/products?id=${photoId}`, { method: 'DELETE' });
    check('photos: cleanup DELETE product → 200', d3.status === 200, `HTTP ${d3.status}`);
    console.log(`  DELETE products row: ${photoId}`);
    if (up2Item?.id) {
      const d4 = await admin(`/admin/api/media?id=${up2Item.id}`, { method: 'DELETE' });
      check('photos: cleanup DELETE media → 200', d4.status === 200, `HTTP ${d4.status}`);
      console.log(`  DELETE media row + Storage object: ${up2Item.id}`);
    }
  }

  console.log(`\nstate written — run again with 'check' after >300s (now + 310s minimum)`);
  finish();
}

/* ------------------------------------------------------------------ */

/**
 * Static lists are ISR'd (fetch revalidate: 300): the first hit after
 * expiry can serve stale HTML while regenerating in the background, so
 * refetch until `want` matches (or the attempts run out) before asserting.
 */
async function getTextWhen(url, want, tries = 4, gapMs = 15000) {
  let res, text;
  for (let i = 0; i < tries; i++) {
    res = await get(url);
    text = await res.text();
    if (want(text, res)) return { status: res.status, text, attempts: i + 1 };
    if (i < tries - 1) await sleep(gapMs);
  }
  return { status: res.status, text, attempts: tries };
}

async function checkPhase() {
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  await login();

  const shop = await getTextWhen(`${SHOP}/shop`, (t) => t.includes('E2E LIVE PROBE'));
  const shopHtml = shop.text;
  check(
    'live /shop shows the new product',
    shop.status === 200 && shopHtml.includes('E2E LIVE PROBE'),
    `HTTP ${shop.status}; refetches=${shop.attempts}`,
  );

  const detail = await get(`${SHOP}/products/${state.productSlug}`);
  const detailHtml = await detail.text();
  check(
    'live product detail renders (payload escaped as text)',
    detail.status === 200 &&
      detailHtml.includes('Probe paragraph one') &&
      detailHtml.includes('&lt;script&gt;') &&
      !/<script>alert\(/.test(detailHtml),
    `HTTP ${detail.status}; executable=${/<script>alert\(/.test(detailHtml)}`,
  );

  const blog = await getTextWhen(`${SHOP}/blog`, (t) => t.includes('E2E live XSS probe'));
  const blogHtml = blog.text;
  check(
    'live /blog lists the new post',
    blog.status === 200 && blogHtml.includes('E2E live XSS probe'),
    `HTTP ${blog.status}; refetches=${blog.attempts}`,
  );
  check(
    'live /blog folio: excerpt payload escaped, no executable script',
    blogHtml.includes('&lt;script&gt;') && !/<script>alert\(/.test(blogHtml),
    `escaped=${blogHtml.includes('&lt;script&gt;')}; executable=${/<script>alert\(/.test(blogHtml)}`,
  );

  const note = await get(`${SHOP}/blog/${state.postSlug}`);
  const noteHtml = await note.text();
  const executable = /<script>alert\(/.test(noteHtml);
  const eventHandler = /<img[^>]*\sonerror\s*=/i.test(noteHtml);
  const escapedBody = noteHtml.includes('&lt;script&gt;');
  const escapedHeading = noteHtml.includes('&lt;img');
  check(
    'live post: <script> renders as text, never executes',
    note.status === 200 && !executable && !eventHandler && escapedBody && escapedHeading,
    `HTTP ${note.status}; executable=${executable}; onerror=${eventHandler}; escapedBody=${escapedBody}; escapedHeading=${escapedHeading}`,
  );

  /* media: still present + retrievable (uploaded in write phase) */
  if (state.mediaId) {
    const list = await admin('/admin/api/media');
    check(
      'live media list (post-cycle) — test item already cleaned in write phase',
      list.status === 200 && !list.json.some((m) => m.id === state.mediaId),
      `HTTP ${list.status}`,
    );
  }

  /* ---- cleanup: delete product + post, verify DB absence ---- */
  const d1 = await admin(`/admin/api/products?id=${state.productId}`, { method: 'DELETE' });
  check('cleanup: DELETE live product → 200', d1.status === 200, `HTTP ${d1.status} ${JSON.stringify(d1.json)}`);
  console.log(`  DELETE products row: ${state.productId}`);
  const d2 = await admin(`/admin/api/posts?id=${state.postId}`, { method: 'DELETE' });
  check('cleanup: DELETE live post → 200', d2.status === 200, `HTTP ${d2.status} ${JSON.stringify(d2.json)}`);
  console.log(`  DELETE blog_posts row: ${state.postId}`);

  const svc = { apikey: '', Authorization: '' };
  const env = Object.fromEntries(
    fs
      .readFileSync(path.resolve('../cra7ty-hub/.env.local'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  svc.apikey = env.SUPABASE_SERVICE_ROLE_KEY;
  svc.Authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  const p = await get(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${state.productId}`, {
    headers: svc,
  });
  check('DB: product row gone', (await p.json()).length === 0);
  const b = await get(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/blog_posts?id=eq.${state.postId}`, {
    headers: svc,
  });
  check('DB: post row gone', (await b.json()).length === 0);

  state.checkedAt = Date.now();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`\nstate updated — run again with 'gone' after >330s from now`);
  finish();
}

/* ------------------------------------------------------------------ */

async function gonePhase() {
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));

  const shop = await getTextWhen(`${SHOP}/shop`, (t) => !t.includes('E2E LIVE PROBE'));
  check(
    'live /shop no longer shows the probe',
    shop.status === 200 && !shop.text.includes('E2E LIVE PROBE'),
    `HTTP ${shop.status}; refetches=${shop.attempts}`,
  );

  const detail = await getTextWhen(
    `${SHOP}/products/${state.productSlug}`,
    (_t, r) => r.status !== 200,
  );
  check('live product detail gone', detail.status !== 200, `HTTP ${detail.status}; refetches=${detail.attempts}`);

  const blog = await getTextWhen(`${SHOP}/blog`, (t) => !t.includes('E2E live XSS probe'));
  check(
    'live /blog no longer lists the probe',
    blog.status === 200 && !blog.text.includes('E2E live XSS probe'),
    `HTTP ${blog.status}; refetches=${blog.attempts}`,
  );

  const note = await getTextWhen(
    `${SHOP}/blog/${state.postSlug}`,
    (_t, r) => r.status !== 200,
  );
  check('live post route gone', note.status !== 200, `HTTP ${note.status}; refetches=${note.attempts}`);

  finish();
}

const phase = process.argv[2];
if (phase === 'write') await writePhase();
else if (phase === 'check') await checkPhase();
else if (phase === 'gone') await gonePhase();
else {
  console.error('usage: node .verify/e2e-live.mjs <write|check|gone>');
  process.exit(2);
}
