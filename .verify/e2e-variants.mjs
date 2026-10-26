/**
 * Stage A2 — product variants on the storefront, local E2E.
 * Run: node .verify/e2e-variants.mjs
 *   (admin dev on :3005, storefront dev on whatever port it picked —
 *    pass it as arg 2; defaults to 3000)
 *
 * Real writes (reported): one products row (created + deleted).
 * A borrowed photo URL from an existing product — no media write.
 */
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'http://localhost:3005';
const SHOP = process.argv[2] ? `http://localhost:${process.argv[2]}` : 'http://localhost:3000';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => `${f.name} (${f.detail ?? ''})`).join(' | '));
    process.exit(1);
  }
}

let cookie = null;
async function admin(path, opts = {}) {
  const headers = { ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) };
  const res = await fetch(`${ADMIN}${path}`, { redirect: 'manual', ...opts, headers });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text };
}

const SLUG = 'e2e-variant-probe';
const ID = 'e2e-variant-probe';

async function main() {
  /* 1. login (real session flow via lib-auth, no email sent) */
  try {
    cookie = await adminLogin(ADMIN);
    check('login → cookie', Boolean(cookie));
  } catch (e) {
    check('login → cookie', false, e.message);
    finish();
    return;
  }

  /* 2. borrow a real photo from an existing active product */
  const list = await admin('/admin/api/products');
  const donor = (list.json?.products ?? list.json ?? []).find?.(
    (p) => Array.isArray(p.images) && p.images.some((s) => /^https?:\/\//.test(s)),
  ) ?? (Array.isArray(list.json) ? list.json.find((p) => p.images?.some((s) => /^https?:\/\//.test(s))) : null);
  const photo = donor?.images?.find((s) => /^https?:\/\//.test(s));
  check('donor photo found', Boolean(photo), photo ?? `list shape: ${JSON.stringify(list.json).slice(0, 120)}`);
  if (!photo) { finish(); return; }

  /* 3. create the variant product — colour axis with priceOverride+stock,
        size axis with stock only, material axis inactive-by-absence */
  const product = {
    id: ID,
    slug: SLUG,
    name: 'E2E VARIANT PROBE',
    description: 'Variant render probe. Not for sale.',
    category: 'origami',
    price: 5000,
    model: 'crane',
    detail: ['Probe paragraph.'],
    specs: [{ label: 'Probe', value: 'yes' }],
    stock: 9,
    status: 'active',
    variants: [
      { id: 'probe-colour-kraft', type: 'colour', value: 'Kraft', hex: '#d9c7a7', stock: 7, active: true },
      { id: 'probe-colour-moss', type: 'colour', value: 'Moss', hex: '#3e5641', active: true },
      {
        id: 'probe-size-grand',
        type: 'size',
        value: 'Grand',
        stock: 2,
        priceOverride: 8000,
        active: true,
      },
      { id: 'probe-size-mini', type: 'size', value: 'Mini', active: true },
      { id: 'probe-hidden', type: 'size', value: 'Hidden', active: false },
    ],
    tags: [],
    images: [photo],
    position: 0,
    updatedAt: new Date().toISOString(),
  };
  const w = await admin('/admin/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(product),
  });
  check('POST variant product → 200', w.status === 200, `HTTP ${w.status} ${JSON.stringify(w.json).slice(0, 200)}`);
  console.log(`  WRITE  products row: ${ID}`);
  if (w.status !== 200) { finish(); return; }

  /* 4. storefront renders the picker — poll (dev fetch revalidate) */
  let html = '';
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${SHOP}/products/${SLUG}`, { cache: 'no-store' });
    html = await res.text();
    if (res.status === 200 && html.includes('probe-colour-kraft')) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  check('product page 200', html.includes('E2E VARIANT PROBE'), '');
  check('colour axis label rendered', html.includes('variant-axis-colour'), '');
  check('kraft swatch rendered', html.includes('#d9c7a7') && html.includes('Kraft'), '');
  check('size chips rendered', html.includes('probe-size-grand') && html.includes('Grand'), '');
  check('inactive variant excluded', !html.includes('probe-hidden') && !html.includes('>Hidden<'), '');
  check(
    'base price shown unselected',
    html.includes('₦5,000') || html.includes('&#8358;5,000') || /5[,.,]000/.test(html),
    '',
  );
  // the stock LINE is the <p> with this exact class combo; swatch title
  // attributes legitimately contain "· 7 in stock" so a bare text match
  // would false-positive
  check(
    'stock line absent before selection',
    !html.includes('mono-label-xs mt-4 text-ink-55'),
    'no selection → no stock <p>',
  );

  /* 5. baseline: a zero-variant product has no picker at all */
  const baseRes = await fetch(`${SHOP}/products/origami-crane-single`, { cache: 'no-store' });
  const baseHtml = await baseRes.text();
  check('baseline product 200', baseRes.status === 200, `HTTP ${baseRes.status}`);
  check(
    'no-variants product: no picker markup',
    !baseHtml.includes('variant-axis-'),
    'picker absent',
  );
  check(
    'no-variants product: add button intact',
    baseHtml.includes('Add to order'),
    'button rendered',
  );

  /* 6. cleanup */
  const d = await admin(`/admin/api/products?id=${ID}`, { method: 'DELETE' });
  check('cleanup DELETE → 200', d.status === 200, `HTTP ${d.status}`);
  console.log(`  DELETE products row: ${ID}`);
  const after = await fetch(`${SHOP}/products/${SLUG}`, { cache: 'no-store' });
  check('probe 404 after delete', after.status === 404, `HTTP ${after.status}`);

  finish();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
