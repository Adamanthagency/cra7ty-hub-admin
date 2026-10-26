/**
 * Local E2E for the mandatory-photos + instant-publish stage.
 * Runs against FRESH dev servers so the new env vars are loaded:
 *   storefront `next dev -p 3000`, admin `next dev -p 3006`.
 * Real remote database; every write this script performs is printed and
 * cleaned up (product rows, media rows, Storage objects).
 *
 *   node .verify/e2e-photos.mjs
 */
import fs from 'node:fs';
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'http://localhost:3006';
const SF = 'http://localhost:3000';

function loadEnv(path) {
  return Object.fromEntries(
    fs
      .readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}
const adminEnv = loadEnv(new URL('../.env.local', import.meta.url));
const sfEnv = loadEnv(new URL('../../cra7ty-hub/.env.local', import.meta.url));
const SECRET = adminEnv.REVALIDATE_SECRET;
const SUPA = adminEnv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = adminEnv.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => `${f.name} (${f.detail ?? ''})`).join(' | '));
    process.exit(1);
  }
}

/* 1×1 PNG — enough for the mime/extension/size rules */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const pngFile = (name) =>
  new Blob([PNG], { type: 'image/png' });

async function call(url, { method = 'GET', headers = {}, body, cookie } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  const res = await fetch(url, { method, headers: h, body, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return {
    status: res.status,
    json,
    text,
    setCookie: setCookie ? setCookie.split(';')[0] : null,
  };
}

let cookie = null;
async function login() {
  try {
    cookie = await adminLogin(ADMIN);
    check('admin: login sets session cookie', Boolean(cookie));
  } catch (e) {
    check('admin: login sets session cookie', false, e.message);
  }
}

async function admin(url, opts = {}) {
  return call(`${ADMIN}${url}`, { ...opts, cookie });
}

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

const productPayload = (id, slug, name, status, images) => ({
  id,
  slug,
  name,
  description: 'Mandatory-photos E2E probe — temporary row, deleted by the same script.',
  category: 'origami',
  price: 777,
  model: 'crane',
  detail: ['Probe paragraph.'],
  specs: [{ label: 'Probe', value: 'yes' }],
  stock: 1,
  status,
  variants: [],
  tags: [],
  images,
  position: 0,
  updatedAt: new Date().toISOString(),
});

async function main() {
  console.log('— part A: revalidate endpoint auth (storefront) —');
  const noAuth = await call(`${SF}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['/shop'] }),
  });
  check('revalidate: no token → 401', noAuth.status === 401, `HTTP ${noAuth.status}`);

  const badAuth = await call(`${SF}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
    body: JSON.stringify({ paths: ['/shop'] }),
  });
  check('revalidate: wrong token → 401', badAuth.status === 401, `HTTP ${badAuth.status}`);

  const good = await call(`${SF}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ paths: ['/shop', '/'], tags: ['db:products'] }),
  });
  check(
    'revalidate: valid token → 200 revalidated:true',
    good.status === 200 && good.json?.revalidated === true,
    `HTTP ${good.status} ${JSON.stringify(good.json)}`,
  );

  const badTag = await call(`${SF}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ tags: ['not-a-real-tag'] }),
  });
  check('revalidate: unknown tag → 400', badTag.status === 400, `HTTP ${badTag.status}`);

  const badPath = await call(`${SF}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ paths: ['/../etc/passwd'] }),
  });
  check('revalidate: traversal path → 400', badPath.status === 400, `HTTP ${badPath.status}`);

  const empty = await call(`${SF}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({}),
  });
  check('revalidate: empty body → 400', empty.status === 400, `HTTP ${empty.status}`);

  await login();

  console.log('\n— part A: photo required to publish —');
  const idNo = `product-e2e-nophoto-${Date.now()}`;
  const noPhoto = await admin('/admin/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productPayload(idNo, `e2e-nophoto-${Date.now()}`, 'E2E NO PHOTO', 'active', [])),
  });
  check(
    'publish block: active without photo → 400',
    noPhoto.status === 400 && (noPhoto.json?.error ?? '').includes('at least one photo'),
    `HTTP ${noPhoto.status} ${noPhoto.json?.error ?? ''}`,
  );
  const rowNo = await db(`products?id=eq.${idNo}&select=id`);
  check('publish block: nothing written for the blocked save', (rowNo.json ?? []).length === 0);

  const placeholderOnly = await admin('/admin/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      productPayload(idNo, `e2e-nophoto-${Date.now()}`, 'E2E PLACEHOLDER SLOT', 'active', ['placeholder-1']),
    ),
  });
  check(
    'publish block: placeholder slot does not count as a photo → 400',
    placeholderOnly.status === 400 && (placeholderOnly.json?.error ?? '').includes('at least one photo'),
    `HTTP ${placeholderOnly.status}`,
  );

  const idDraft = `product-e2e-draft-${Date.now()}`;
  const draft = await admin('/admin/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productPayload(idDraft, `e2e-draft-${Date.now()}`, 'E2E DRAFT', 'inactive', [])),
  });
  check(
    'publish block: draft without photo → 200',
    draft.status === 200 && Boolean(draft.json?.revalidate),
    `HTTP ${draft.status} revalidate=${JSON.stringify(draft.json?.revalidate)}`,
  );
  console.log(`  WRITE  products row (draft): ${idDraft}`);
  const dDraft = await admin(`/admin/api/products?id=${idDraft}`, { method: 'DELETE' });
  check('cleanup: draft row deleted → 200', dDraft.status === 200, `HTTP ${dDraft.status}`);
  console.log(`  DELETE products row: ${idDraft}`);

  console.log('\n— part C: multi-file upload —');
  const batch = new FormData();
  batch.append('files', pngFile(), 'e2e-batch-1.png');
  batch.append('files', pngFile(), 'e2e-batch-2.png');
  const upBatch = await admin('/admin/api/media', { method: 'POST', body: batch });
  const items = upBatch.json?.items ?? [];
  check(
    'media: batch of 2 → 201 with items[2]',
    upBatch.status === 201 && items.length === 2 && items.every((i) => i.url.startsWith('http')),
    `HTTP ${upBatch.status} items=${items.length}`,
  );
  console.log(`  WRITE  media rows + Storage objects: ${items.map((i) => i.id).join(', ')}`);

  const gif = new FormData();
  gif.append('files', new Blob([PNG], { type: 'image/gif' }), 'e2e-bad.gif');
  const upGif = await admin('/admin/api/media', { method: 'POST', body: gif });
  check('media: .gif rejected → 400', upGif.status === 400, `HTTP ${upGif.status}`);

  const seven = new FormData();
  for (let i = 1; i <= 7; i++) seven.append('files', pngFile(), `e2e-many-${i}.png`);
  const upSeven = await admin('/admin/api/media', { method: 'POST', body: seven });
  check('media: 7-file batch rejected → 400', upSeven.status === 400, `HTTP ${upSeven.status}`);

  for (const item of items) {
    const del = await admin(`/admin/api/media?id=${item.id}`, { method: 'DELETE' });
    check(`cleanup: media ${item.filename} deleted`, del.status === 200, `HTTP ${del.status}`);
    console.log(`  DELETE media row + Storage object: ${item.id}`);
  }

  console.log('\n— part B: product with photo → instant publish —');
  const one = new FormData();
  one.append('files', pngFile(), 'e2e-main-photo.png');
  const upOne = await admin('/admin/api/media', { method: 'POST', body: one });
  const photoUrl = upOne.json?.items?.[0]?.url;
  check('media: single upload → 201 with URL', upOne.status === 201 && Boolean(photoUrl), `HTTP ${upOne.status}`);
  console.log(`  WRITE  media row + Storage object: ${upOne.json?.items?.[0]?.id}`);

  const stamp = Date.now();
  const idLive = `product-e2e-live-${stamp}`;
  const slugLive = `e2e-live-${stamp}`;
  const t0 = Date.now();
  const live = await admin('/admin/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productPayload(idLive, slugLive, 'E2E LIVE PHOTO PROBE', 'active', [photoUrl])),
  });
  const tSaved = Date.now();
  check(
    'instant publish: active with photo → 200 + revalidate.ok',
    live.status === 200 && live.json?.revalidate?.ok === true,
    `HTTP ${live.status} revalidate=${JSON.stringify(live.json?.revalidate)}`,
  );
  console.log(`  WRITE  products row (active): ${idLive}`);

  let seenAt = null;
  let shopText = '';
  for (let i = 0; i < 20 && !seenAt; i++) {
    const res = await call(`${SF}/shop?cb=${Date.now()}`);
    shopText = res.text;
    if (res.text.includes('E2E LIVE PHOTO PROBE')) seenAt = Date.now();
    else await sleep(500);
  }
  check(
    'instant publish: /shop shows the product after save',
    Boolean(seenAt),
    seenAt ? `visible ${seenAt - tSaved} ms after save response (first poll ~0 ms)` : 'never appeared',
  );

  const detail = await call(`${SF}/products/${slugLive}`);
  check(
    'product page renders the photo <img> (storage URL in HTML)',
    detail.text.includes(photoUrl),
    `HTTP ${detail.status}`,
  );

  const tDel = Date.now();
  const delLive = await admin(`/admin/api/products?id=${idLive}`, { method: 'DELETE' });
  check(
    'instant publish: DELETE → 200 + revalidate.ok',
    delLive.status === 200 && delLive.json?.revalidate?.ok === true,
    `HTTP ${delLive.status} revalidate=${JSON.stringify(delLive.json?.revalidate)}`,
  );
  console.log(`  DELETE products row: ${idLive}`);
  let goneAt = null;
  for (let i = 0; i < 20 && !goneAt; i++) {
    const res = await call(`${SF}/shop?cb=${Date.now()}`);
    if (!res.text.includes('E2E LIVE PHOTO PROBE')) goneAt = Date.now();
    else await sleep(500);
  }
  check(
    'instant publish: /shop drops the deleted product',
    Boolean(goneAt),
    goneAt ? `gone ${goneAt - tDel} ms after delete response` : 'still present',
  );

  if (upOne.json?.items?.[0]?.id) {
    const delM = await admin(`/admin/api/media?id=${upOne.json.items[0].id}`, { method: 'DELETE' });
    check('cleanup: main photo media deleted', delM.status === 200, `HTTP ${delM.status}`);
    console.log(`  DELETE media row + Storage object: ${upOne.json.items[0].id}`);
  }

  console.log('\n— part A: photo-less products (read-only flag) + placeholder render —');
  const active = await db('products?select=slug,name,status,images&status=eq.active');
  const photoless = (active.json ?? []).filter(
    (p) => !(p.images ?? []).some((u) => /^https?:\/\//.test(u)),
  );
  console.log(
    photoless.length === 0
      ? '  no active product is missing a photo'
      : `  ACTIVE PRODUCTS WITHOUT A PHOTO (${photoless.length}):\n` +
          photoless.map((p) => `    - ${p.slug}  “${p.name}”`).join('\n'),
  );
  if (photoless.length > 0) {
    const target = photoless[0];
    const page = await call(`${SF}/products/${target.slug}`);
    check(
      'placeholder: photo-less product page shows “No photo yet”',
      page.status === 200 && page.text.includes('No photo yet'),
      `HTTP ${page.status} slug=${target.slug}`,
    );
    const shop = await call(`${SF}/shop?cb=${Date.now()}`);
    check(
      'placeholder: photo-less product card shows “No photo yet” on /shop',
      shop.text.includes('No photo yet'),
    );
  } else {
    console.log('  (no photo-less active product — placeholder render check skipped)');
  }

  console.log(`\ntotal time: ${((Date.now() - t0) / 1000).toFixed(1)}s since first write of this block`);
  finish();
}

main().catch((error) => {
  console.error('SCRIPT ERROR:', error);
  process.exit(1);
});
