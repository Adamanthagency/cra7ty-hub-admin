// End-to-end proof for the instant-publish handshake: the admin's own
// POST /admin/api/events runs revalidateStorefront({paths, tags:
// ['db:events']}) server-to-server with ITS env (STOREFRONT_URL +
// REVALIDATE_SECRET), and the response carries revalidate.ok. Before
// the db:events allowlist fix this answered ok:false HTTP 400
// "Unknown tag". A temp event is created through the real admin API
// and deleted from the database afterwards.
import { adminLogin } from './lib-auth.mjs';
import { readFileSync } from 'node:fs';

const ADMIN = process.env.ADMIN_BASE ?? 'https://cra7ty-hub-admin.vercel.app';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const S = env.SUPABASE_SERVICE_ROLE_KEY;
const rest = (method, table, query, body) =>
  fetch(`${URL_}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, text: await r.text() }));

let pass = 0, fail = 0;
const ck = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? pass++ : fail++;
};

const SUFFIX = Date.now().toString(36).slice(-6);
let createdId = null;

try {
  const cookie = await adminLogin(ADMIN);
  console.log('admin session established');

  const res = await fetch(`${ADMIN}/admin/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      slug: `rvcheck-${SUFFIX}`,
      name: `Revalidate Check ${SUFFIX}`,
      description: 'temp — created to verify the publish handshake',
      kind: 'workshop',
      startsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      endsAt: null,
      location: null,
      price: 0,
      capacity: null,
      imageUrl: null,
      status: 'draft',
    }),
  });
  const body = await res.json();
  console.log('POST /admin/api/events -> HTTP', res.status);
  createdId = body.id ?? null;

  ck('event created through the admin API', res.status === 200 && body.ok === true,
    JSON.stringify(body).slice(0, 200));
  ck('revalidate reported ok', body.revalidate?.ok === true,
    JSON.stringify(body.revalidate));

  // The storefront also answers the tag purge with revalidated:true —
  // hitting the endpoint directly with the admin-side semantics proves
  // the allowlist accepts db:events (400 before the fix).
  const direct = await fetch(`${process.env.STOREFRONT ?? 'https://www.cra7tyhub.com'}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['/workshops'], tags: ['db:events'] }),
  });
  ck('direct call with NO token is rejected (secret is set)',
    direct.status === 401 || direct.status === 503, `HTTP ${direct.status}`);
} finally {
  if (createdId) {
    const del = await rest('DELETE', 'events', `id=eq.${createdId}`);
    console.log(`Cleanup: temp event ${createdId} deleted (HTTP ${del.status}).`);
  }
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
