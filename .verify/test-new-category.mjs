/**
 * The reported bug, reproduced at the exact endpoint the product editor's
 * Publish button calls (POST /admin/api/products):
 *
 *  1. saving a product under a NEWLY added category slug used to 400 with
 *     "Category must be one of: origami, table, party, gift, bulk, paper"
 *     → must now succeed;
 *  2. a genuinely malformed category must still be rejected (shape check),
 *     with the new message;
 *  3. cleanup: the test row is deleted again.
 */
import { adminLogin } from './lib-auth.mjs';

const BASE = process.argv[2] ?? 'http://localhost:52710';
let failed = 0;
const ck = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` -- ${detail}` : ''}`);
  if (!cond) failed += 1;
};

const cookie = await adminLogin(BASE);
const headers = { 'Content-Type': 'application/json', Cookie: cookie };
const stamp = Date.now();
const id = `test-cat-${stamp}`;
const slug = `test-cat-${stamp}`;

// --- 1. new category slug → must save -------------------------------------
const product = {
  id,
  slug,
  name: 'Category publish test',
  description: 'Temporary row proving a newly added category can be published.',
  category: 'wedding-favours',
  price: 1500,
  status: 'inactive',
  stock: 0,
  productType: 'physical',
  detail: [],
  specs: [],
  variants: [],
  tags: [],
  images: [],
  position: 0,
};

let res = await fetch(`${BASE}/admin/api/products`, {
  method: 'POST',
  headers,
  body: JSON.stringify(product),
});
let body = await res.json().catch(() => ({}));
ck('product with a NEW category saves (was 400)', res.status === 200 && body.ok === true,
   `HTTP ${res.status} ${JSON.stringify(body).slice(0, 160)}`);

// --- 2. malformed category → still rejected, with the new message ---------
res = await fetch(`${BASE}/admin/api/products`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ ...product, id: `${id}-bad`, slug: `${slug}-bad`, category: 'Bad Category!' }),
});
body = await res.json().catch(() => ({}));
const msg = String(body.error ?? '');
ck('malformed category still rejected', res.status === 400, `HTTP ${res.status}`);
ck('rejection explains the slug rule', msg.includes('lowercase letters') && !msg.includes('origami, table'),
   msg.slice(0, 140));

// --- 3. the row really landed with the new category -----------------------
res = await fetch(`${BASE}/admin/api/products`, { headers });
body = await res.json().catch(() => ({}));
const row = (body.products ?? []).find((p) => p.id === id);
ck('row stored with the new category', row?.category === 'wedding-favours',
   `category=${row?.category}`);

// --- cleanup ---------------------------------------------------------------
if (row) {
  const del = await fetch(`${BASE}/admin/api/products?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  ck('test row deleted again', del.ok, `HTTP ${del.status}`);
}

console.log(`RESULT: ${failed === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failed === 0 ? 0 : 1);
