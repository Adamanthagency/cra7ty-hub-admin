/**
 * End-to-end for the digital-file bug fix:
 *  1. upload via the editor's exact 3-step flow (sign → PUT → confirm)
 *  2. object lands in the private bucket (list + HEAD)
 *  3. product saves through /admin/api/products with download_path set
 *  4. a real signed download URL (storefront's signPath shape) serves the bytes
 * Cleans up product + object afterwards.
 */
import { readFileSync } from 'node:fs';
import { adminLogin } from './lib-auth.mjs';

const BASE = 'http://localhost:3005';
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

let pass = 0, fail = 0;
const ck = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? pass++ : fail++;
};

const cookie = await adminLogin(BASE);
ck('admin session', Boolean(cookie));

let storagePath = null;
let productId = null;
try {
  /* 1 — upload exactly as product-editor.tsx does */
  const filename = 'E2E Digital Pack.pdf';
  const bytes = '%PDF-1.4\n% e2e digital fix verification\n' + 'x'.repeat(64);
  const signRes = await fetch(`${BASE}/admin/api/digital-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'sign', productId: 'product-e2e-digital-fix', filename, sizeBytes: bytes.length }),
  });
  const sign = await signRes.json();
  ck('sign returns a string MIME', signRes.ok && typeof sign.contentType === 'string' && sign.contentType === 'application/pdf', JSON.stringify(sign.contentType));

  const put = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': sign.contentType },
    body: bytes,
  });
  const putBody = await put.text();
  ck('PUT to signed upload URL succeeds', put.ok, `HTTP ${put.status} ${put.ok ? '' : putBody.slice(0, 200)}`);

  const confRes = await fetch(`${BASE}/admin/api/digital-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'confirm', path: sign.path }),
  });
  const conf = await confRes.json();
  ck('confirm accepts the object', confRes.ok && conf.path === sign.path, JSON.stringify(conf).slice(0, 160));
  storagePath = sign.path;

  /* 2 — object really is in the bucket */
  const listed = await fetch(`${SUPA}/storage/v1/object/list/digital-files`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'product-e2e-digital-fix/', limit: 20 }),
  });
  const rows = await listed.json();
  const found = Array.isArray(rows) && rows.rows ? rows.rows : rows;
  ck('object listed in bucket', Array.isArray(found) && found.some((r) => r.name === storagePath.split('/')[1]), JSON.stringify(found).slice(0, 200));

  const head = await fetch(`${SUPA}/storage/v1/object/digital-files/${storagePath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'HEAD',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  ck('HEAD the stored object → 200', head.ok, `HTTP ${head.status}`);

  /* 3 — product saves with download_path set */
  const product = {
    id: 'product-e2e-digital-fix',
    position: 999999,
    slug: `e2e-digital-fix-${Date.now()}`,
    name: 'E2E Digital Fix Check',
    category: 'paper',
    price: 1000,
    description: 'Temporary product created by e2e-digital-fix.mjs.',
    model: 'crane',
    detail: [],
    specs: [],
    status: 'inactive', // draft: no photo required
    stock: 0,
    productType: 'digital',
    downloadPath: storagePath,
    downloadFilename: 'E2E Digital Pack.pdf',
    variants: [],
    tags: [],
    images: [],
    seo: {},
    updated_at: new Date().toISOString(),
  };
  const saveRes = await fetch(`${BASE}/admin/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(product),
  });
  const saveBody = await saveRes.json();
  ck('product saves with digital fields', saveRes.ok && saveBody.ok === true, `HTTP ${saveRes.status} ${JSON.stringify(saveBody).slice(0, 200)}`);
  productId = product.id;

  // read the row back from the DB — download_path must have persisted
  const rowsRes = await fetch(`${SUPA}/rest/v1/products?id=eq.${product.id}&select=id,product_type,download_path,download_filename`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  const dbRows = await rowsRes.json();
  ck('DB row has download_path', dbRows?.[0]?.download_path === storagePath, JSON.stringify(dbRows).slice(0, 240));

  /* 4 — real signed download URL, minted the way downloads.ts does */
  const signDl = await fetch(`${SUPA}/storage/v1/object/sign/digital-files/${storagePath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  const dlJson = await signDl.json();
  const abs = dlJson.signedURL?.startsWith('http') ? dlJson.signedURL : `${SUPA}/storage/v1${dlJson.signedURL ?? ''}`;
  ck('signed download URL minted', signDl.ok && Boolean(dlJson.signedURL), String(dlJson.signedURL).slice(0, 80));

  const got = await fetch(abs);
  const text = await got.text();
  ck('signed URL serves the file (200)', got.status === 200, `HTTP ${got.status}`);
  ck('served bytes match what was uploaded', text === bytes, `${text.length} bytes vs ${bytes.length}`);
} finally {
  /* cleanup */
  if (productId) {
    const del = await fetch(`${BASE}/admin/api/products?id=${productId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    console.log(`cleanup product: HTTP ${del.status}`);
  }
  if (storagePath) {
    const del = await fetch(`${BASE}/admin/api/digital-files?path=${encodeURIComponent(storagePath)}`, { method: 'DELETE', headers: { Cookie: cookie } });
    console.log(`cleanup object: HTTP ${del.status}`);
  }
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
