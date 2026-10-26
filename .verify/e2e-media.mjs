/**
 * Stage 6 media E2E — real writes against the real bucket, real cleanup.
 * Run: node .verify/e2e-media.mjs   (admin dev server on :3005 required)
 *
 * Checks:
 *   1  GET /admin/api/media without cookie → 401
 *   2  POST a .gif → 400 (server-side validation)
 *   3  POST a 6 MB jpg → 400 (server-side size rule)
 *   4  POST a real 1×1 png → 201 with the stored item (url/size/mime)
 *   5  GET list contains the uploaded row
 *   6  the public Storage URL serves the bytes (HTTP 200, image/png)
 *   7  DELETE without cookie → 401
 *   8  DELETE ?id= → 200; row gone from the list
 *   9  the object URL is gone too (404) — object AND row removed
 *   10 unknown id → 404
 */

import fs from 'node:fs';
import { adminLogin } from './lib-auth.mjs';

// Service credentials for the authoritative bucket-list check only.
const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
process.env.SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY;

const BASE = process.env.BASE ?? 'http://localhost:3005';

let cookie = null;
let pass = 0;
let fail = 0;
const uploaded = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 204/empty */
  }
  return { res, body };
}

async function upload(bytes, filename, mime) {
  const form = new FormData();
  form.append('file', new File([bytes], filename, { type: mime }));
  return call('/admin/api/media', { method: 'POST', body: form });
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/* 1 — session cookie (real magic-link flow, no email sent) */
{
  try {
    cookie = await adminLogin(BASE);
    check('login sets session cookie', Boolean(cookie));
  } catch (e) {
    check('login sets session cookie', false, e.message);
  }
}

/* 2 — no cookie → 401 */
{
  const saved = cookie;
  cookie = null;
  const { res } = await call('/admin/api/media');
  check('GET media without cookie → 401', res.status === 401, `HTTP ${res.status}`);
  const post = await upload(PNG_1X1, 'x.png', 'image/png');
  check('POST media without cookie → 401', post.res.status === 401, `HTTP ${post.res.status}`);
  cookie = saved;
}

/* 3 — bad type → 400 */
{
  const { res, body } = await upload(Buffer.from('GIF89a'), 'anim.gif', 'image/gif');
  check('POST a .gif → 400', res.status === 400, `HTTP ${res.status} ${JSON.stringify(body)}`);
}

/* 4 — oversize → 400 */
{
  const { res, body } = await upload(new Uint8Array(6 * 1024 * 1024), 'big.jpg', 'image/jpeg');
  check('POST a 6 MB jpg → 400', res.status === 400, `HTTP ${res.status} ${JSON.stringify(body)}`);
}

/* 5 — real upload → 201 (batch shape: { items: [...] }) */
let item = null;
{
  const { res, body } = await upload(PNG_1X1, 'e2e-stage6.png', 'image/png');
  const first = Array.isArray(body?.items) ? body.items[0] : body;
  check(
    'POST a real png → 201 + stored item',
    res.status === 201 && first?.id && first?.url?.includes('/storage/v1/object/public/media/'),
    `HTTP ${res.status} ${JSON.stringify(body)}`,
  );
  if (res.status === 201 && first?.id) {
    item = first;
    uploaded.push(first.id);
    check(
      'item shape matches MediaItem',
      first.filename === 'e2e-stage6.png' &&
        first.mimeType === 'image/png' &&
        first.sizeBytes === PNG_1X1.length &&
        typeof first.createdAt === 'string',
      JSON.stringify(first),
    );
  }
}

/* 6 — list contains it (bare array or { items }) */
if (item) {
  const { res, body } = await call('/admin/api/media');
  const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
  const found = list.some((m) => m.id === item.id);
  check('GET list contains the uploaded row', res.status === 200 && found, `HTTP ${res.status}`);
}

/* 7 — public URL serves the bytes */
if (item) {
  const res = await fetch(item.url);
  const type = res.headers.get('content-type') ?? '';
  check(
    'public Storage URL serves the image',
    res.status === 200 && type.includes('image/png'),
    `HTTP ${res.status} ${type}`,
  );
}

/* 8 — DELETE without cookie → 401 */
if (item) {
  const saved = cookie;
  cookie = null;
  const { res } = await call(`/admin/api/media?id=${item.id}`, { method: 'DELETE' });
  check('DELETE without cookie → 401', res.status === 401, `HTTP ${res.status}`);
  cookie = saved;
}

/* 9 — delete removes row */
if (item) {
  const { res } = await call(`/admin/api/media?id=${item.id}`, { method: 'DELETE' });
  check('DELETE ?id= → 200', res.status === 200, `HTTP ${res.status}`);
  const { body } = await call('/admin/api/media');
  const gone = Array.isArray(body) && !body.some((m) => m.id === item.id);
  check('row gone from the list', gone, JSON.stringify(body).slice(0, 200));
}

/* 10 — object gone from the bucket (authoritative: the list API).
 * The public URL is checked too, but INFORMATIONALLY: Supabase's public
 * route sits behind Cloudflare, which serves a cached HIT for a few
 * seconds after deletion (observed: cf-cache HIT at +3s), and answers
 * 400 (not 404) for objects that never existed. */
if (item) {
  const name = item.url.split('/storage/v1/object/public/media/')[1];
  const listRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/list/media`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: name, limit: 10, offset: 0 }),
  });
  const list = await listRes.json();
  const stillThere = Array.isArray(list) && list.some((o) => o.name === name);
  check(
    'object removed from the bucket (list API)',
    listRes.ok && !stillThere,
    `HTTP ${listRes.status} ${JSON.stringify(list).slice(0, 200)}`,
  );
  const res = await fetch(item.url);
  const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
  if (res.status === 200 && bytes > 0) {
    console.log(
      `  · public URL still 200 after delete — CDN cache HIT (cf-cache), not a live object; bucket has ${list.length} matching entries`,
    );
  } else {
    check('public URL no longer serves the image', res.status !== 200, `HTTP ${res.status}`);
  }
}

/* 11 — unknown id → 404 */
{
  const { res } = await call('/admin/api/media?id=media-does-not-exist', { method: 'DELETE' });
  check('DELETE unknown id → 404', res.status === 404, `HTTP ${res.status}`);
}

/* Final sweep: nothing of ours may remain in the library. */
if (uploaded.length > 0) {
  const { body } = await call('/admin/api/media');
  const rows = Array.isArray(body) ? body : [];
  const leftovers = rows.filter((m) => uploaded.includes(m.id));
  check('cleanup — no test rows remain', leftovers.length === 0, JSON.stringify(leftovers));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
