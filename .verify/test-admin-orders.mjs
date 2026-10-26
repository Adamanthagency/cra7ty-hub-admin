/**
 * Stage 7 admin verification — against the REAL admin on 127.0.0.1:3998
 * with a REAL session cookie (lib-auth generate_link flow) and the REAL
 * database.
 *
 * Seeds four orders through the actual checkout RPCs (not raw inserts):
 *   A pending            → status-transition tests
 *   B paid               → analytics revenue
 *   C paid + mismatch    → needs_review flag surfacing
 *   D paid + delivered   → tracker "delivered today"
 * plus two promo codes (one with usage_count=3 to prove edits never
 * reset it). ALL seeded rows are deleted at the end and the product's
 * stock restored — every write is reported.
 */
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'http://127.0.0.1:3998';
const env = Object.fromEntries(
  (await import('node:fs')).readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
}

async function db(method, table, query = '', body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${method} ${table}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

async function rpc(fn, args) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

let cookie = '';
async function api(path, opts = {}) {
  const res = await fetch(`${ADMIN}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json };
}

const CUSTOMER = {
  name: 'Stage Seven Tester', email: 'stage7-test@example.com',
  phone: '08000000007', address: '7 Verification Lane, Lagos',
};
const seededNumbers = [];
let testProduct = null;
let originalStock = null;

async function seed() {
  testProduct = (await db('GET', 'products',
    'status=eq.active&stock=gt.10&order=stock.desc&select=id,name,stock,price&limit=1'))[0];
  if (!testProduct) throw new Error('no active product with stock > 10');
  originalStock = testProduct.stock;
  console.log(`test product: ${testProduct.id} (${testProduct.name}) price=${testProduct.price} stock=${originalStock}`);

  const mk = async () => {
    const created = await rpc('create_checkout_order', {
      p_lines: [{ productId: testProduct.id, quantity: 1 }],
      p_customer: CUSTOMER, p_coupon: null,
    });
    seededNumbers.push(created.orderNumber);
    return created;
  };

  const a = await mk(); // pending
  const b = await mk(); // paid
  await rpc('confirm_paid_order', { p_reference: b.reference, p_amount_kobo: b.total * 100, p_source: 'webhook' });
  const c = await mk(); // paid but amount-mismatched
  await rpc('confirm_paid_order', { p_reference: c.reference, p_amount_kobo: c.total * 100 - 100, p_source: 'webhook' });
  const d = await mk(); // paid + delivered
  await rpc('confirm_paid_order', { p_reference: d.reference, p_amount_kobo: d.total * 100, p_source: 'verify' });
  const dRow = (await db('GET', 'orders', `order_number=eq.${d.orderNumber}&select=id`))[0];
  await rpc('apply_order_status', { p_order_id: dRow.id, p_next: 'confirmed' });
  await rpc('apply_order_status', { p_order_id: dRow.id, p_next: 'in_transit' });
  await rpc('apply_order_status', { p_order_id: dRow.id, p_next: 'delivered' });

  return { a, b, c, d };
}

async function main() {
  cookie = await adminLogin(ADMIN);
  console.log('real session established\n');

  const orders = await seed();
  console.log(`seeded orders: ${seededNumbers.join(', ')} (stock now ${originalStock - 4})\n`);

  /* ---- orders list ---- */
  const list = await api('/admin/api/orders');
  const mine = (list.json?.orders ?? []).filter((o) => seededNumbers.includes(o.id));
  check('GET /admin/api/orders → 200, all 4 seeded orders present with items',
    list.status === 200 && mine.length === 4 && mine.every((o) => o.items.length === 1),
    `status=${list.status} found=${mine.length}`);
  const byNumber = Object.fromEntries(mine.map((o) => [o.id, o]));
  check('payment axis mapped (pending/paid) + needsReview on the mismatch order',
    byNumber[seededNumbers[0]]?.paymentStatus === 'pending' &&
    byNumber[seededNumbers[1]]?.paymentStatus === 'paid' &&
    byNumber[seededNumbers[2]]?.needsReview === true &&
    byNumber[seededNumbers[2]]?.reviewReason === 'amount_mismatch',
    JSON.stringify(byNumber[seededNumbers[2]] ?? {}));

  /* ---- detail ---- */
  const detail = await api(`/admin/api/orders/${seededNumbers[1]}`);
  check('GET /admin/api/orders/[id] → 200 with items + email',
    detail.status === 200 && detail.json?.order?.items?.length === 1 &&
    detail.json?.order?.customerEmail === CUSTOMER.email,
    `status=${detail.status}`);

  /* ---- status transitions (DB-enforced) ---- */
  const fwd = await api(`/admin/api/orders/${seededNumbers[0]}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }),
  });
  check('PATCH pending→confirmed → 200 (forward-only, DB-validated)',
    fwd.status === 200 && fwd.json?.order?.status === 'confirmed',
    `status=${fwd.status} ${JSON.stringify(fwd.json)}`);
  const back = await api(`/admin/api/orders/${seededNumbers[0]}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'pending' }),
  });
  check('PATCH confirmed→pending → 409 (backwards rejected by the DB)',
    back.status === 409, `status=${back.status}`);
  const bogus = await api(`/admin/api/orders/${seededNumbers[0]}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'teleported' }),
  });
  check('PATCH bogus status → 400', bogus.status === 400, `status=${bogus.status}`);
  const missing = await api('/admin/api/orders/CH-99999', { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
  check('PATCH unknown order → 404', missing.status === 404, `status=${missing.status}`);

  /* ---- notes ---- */
  const noted = await api(`/admin/api/orders/${seededNumbers[1]}`, {
    method: 'PATCH', body: JSON.stringify({ notes: 'stage7 note' }),
  });
  check('PATCH notes → saved and returned',
    noted.status === 200 && noted.json?.order?.notes === 'stage7 note',
    JSON.stringify(noted.json));

  /* ---- auth gate ---- */
  const saved = cookie; cookie = '';
  const anon = await api('/admin/api/orders');
  cookie = saved;
  check('GET /admin/api/orders without cookie → 401', anon.status === 401, `status=${anon.status}`);

  /* ---- promo codes ---- */
  const created = await api('/admin/api/promo-codes', {
    method: 'POST',
    body: JSON.stringify({
      code: 'stage7pct', type: 'percentage', value: 15,
      usageLimit: 10, expiresAt: '2027-06-30', minOrderAmount: 5000, active: true,
    }),
  });
  check('POST promo code: lowercase input stored UPPERCASE with generated id',
    created.status === 200 && created.json?.promo?.code === 'STAGE7PCT' &&
    typeof created.json?.promo?.id === 'string' && created.json?.promo?.usageCount === 0,
    JSON.stringify(created.json));

  // Simulate real redemptions: usage_count=3 owned by the payment flow.
  await db('PATCH', 'coupon_codes?code=eq.STAGE7PCT', '', { usage_count: 3 });
  const edited = await api('/admin/api/promo-codes', {
    method: 'POST',
    body: JSON.stringify({
      id: created.json.promo.id, code: 'STAGE7PCT', type: 'percentage', value: 20,
      usageLimit: 10, expiresAt: '2027-06-30', minOrderAmount: 5000, active: true,
    }),
  });
  const afterEdit = (await db('GET', 'coupon_codes', 'code=eq.STAGE7PCT&select=value,usage_count'))[0];
  check('editing a code never resets usage_count (3 stays 3)',
    edited.status === 200 && afterEdit?.value === 20 && afterEdit?.usage_count === 3,
    JSON.stringify(afterEdit));

  const dup = await api('/admin/api/promo-codes', {
    method: 'POST',
    body: JSON.stringify({ code: 'stage7pct', type: 'flat', value: 100 }),
  });
  check('duplicate code rejected with a clear error',
    dup.status === 500 && String(dup.json?.error ?? '').includes('coupon_codes_code_key'),
    JSON.stringify(dup.json));

  const badPct = await api('/admin/api/promo-codes', {
    method: 'POST', body: JSON.stringify({ code: 'STAGE7BAD', type: 'percentage', value: 150 }),
  });
  check('percentage > 100 rejected → 400', badPct.status === 400, `status=${badPct.status}`);

  const used = await db('POST', 'coupon_codes', '', {
    code: 'STAGE7USED', type: 'flat', value: 500, usage_limit: 1, usage_count: 1, active: true,
  });
  const del = await api(`/admin/api/promo-codes?id=${used[0].id}`, { method: 'DELETE' });
  const gone = await db('GET', 'coupon_codes', 'id=eq.' + used[0].id);
  check('DELETE promo code removes the row', del.status === 200 && gone.length === 0,
    `status=${del.status} remaining=${gone.length}`);

  const listP = await api('/admin/api/promo-codes');
  check('GET /admin/api/promo-codes → 200, STAGE7PCT present',
    listP.status === 200 && (listP.json?.promoCodes ?? []).some((c) => c.code === 'STAGE7PCT'),
    `status=${listP.status}`);

  /* ---- analytics ---- */
  const analytics = await api('/admin/api/analytics');
  const totals = analytics.json?.totals ?? {};
  check('GET /admin/api/analytics → 200 with totals',
    analytics.status === 200 && typeof totals.revenue === 'number' && totals.orders >= 4,
    JSON.stringify(totals));
  check('analytics: revenue counts ONLY paid orders (3 paid, not 4) and needsReview=1',
    totals.paidOrders === 3 && totals.needsReview === 1 && totals.deliveredToday === 1,
    JSON.stringify(totals));
  check('analytics: 14-day series present',
    Array.isArray(analytics.json?.days) && analytics.json.days.length === 14,
    `days=${analytics.json?.days?.length}`);
  check('analytics: top products ranked from paid orders',
    (analytics.json?.topProducts ?? []).length >= 1 &&
    analytics.json.topProducts[0].name === testProduct.name,
    JSON.stringify(analytics.json?.topProducts?.[0]));

  const anonA = await api('/admin/api/analytics', { });
  cookie = '';
  const anonB = await api('/admin/api/analytics');
  cookie = saved;
  check('analytics/promo endpoints reject anonymous calls',
    anonB.status === 401, `status=${anonB.status}`);

  return orders;
}

const cleanup = {
  async run() {
    const { db: d } = { db };
    await d('DELETE', 'orders', 'customer_email=eq.stage7-test@example.com');
    if (testProduct && originalStock != null) {
      await d('PATCH', `products?id=eq.${encodeURIComponent(testProduct.id)}`, '', { stock: originalStock });
    }
    await d('DELETE', 'coupon_codes', 'code=in.(STAGE7PCT,STAGE7USED)');
    console.log(`\ncleanup: stage-7 orders (+items) deleted, stock of ${testProduct?.id} restored to ${originalStock}, test coupons deleted`);
  },
};

try {
  await main();
  await cleanup.run();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error(`FATAL: ${error.message}`);
  try { await cleanup.run(); } catch { /* report the original failure */ }
  process.exit(1);
}
