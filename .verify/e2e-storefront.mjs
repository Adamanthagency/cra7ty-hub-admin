/**
 * Local storefront read-path test (Stage 4/5), in two phases so Next's
 * fetch cache (revalidate: 300, persisted in .next/cache/fetch-cache) can
 * be cleared between writing and reading:
 *
 *   node e2e-storefront.mjs write    # create probe rows via the admin API
 *   <stop storefront, rm -rf .next/cache/fetch-cache, restart storefront>
 *   node e2e-storefront.mjs check    # read pages, assert, then delete rows
 *
 * The write phase runs BEFORE any page of this phase is fetched, so a
 * visible difference on the pages can only come from the status filter.
 */
import fs from 'node:fs';
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'http://localhost:3005';
const SHOP = 'http://localhost:3006';
const STATE = new URL('./e2e-storefront-state.json', import.meta.url);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, opts = {}, tries = 8) {
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

let cookie = null;
async function login() {
  try {
    cookie = await adminLogin(ADMIN);
    check('admin session', Boolean(cookie));
  } catch (e) {
    check('admin session', false, e.message);
  }
}

async function admin(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await call(`${ADMIN}${path}`, { ...opts, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body };
}

async function page(path) {
  const res = await call(`${SHOP}${path}`);
  return { status: res.status, html: await res.text() };
}

const productPayload = (id, slug, name, status) => ({
  id,
  slug,
  name,
  description: 'Temporary product used to verify the storefront status filter.',
  category: 'origami',
  price: 777,
  model: 'crane',
  detail: ['Probe paragraph one.'],
  specs: [{ label: 'Probe', value: 'yes' }],
  stock: 1,
  status,
  variants: [],
  tags: [],
  images: [],
  position: 0,
  updatedAt: new Date().toISOString(),
});

const postPayload = (id, slug, title, status, content) => ({
  id,
  title,
  titleLines: ['E2E probe', 'line two'],
  standfirst: 'A temporary standfirst for the storefront read test.',
  slug,
  excerpt: 'Temporary excerpt for the folio list.',
  content,
  category: 'Studio practice',
  model: 'crane',
  date: '2026-10-24',
  minutes: 1,
  relatedProductIds: [],
  tags: [],
  status,
  placeholder: true,
  coverUrl: null,
  publishedAt: status === 'published' ? '2026-10-24' : null,
  updatedAt: new Date().toISOString(),
});

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => `${f.name} (${f.detail ?? ''})`).join(' | '));
    process.exit(1);
  }
}

async function writePhase() {
  await login();
  const stamp = Date.now().toString(36);
  const state = {
    productActiveId: `product-act-${stamp}`,
    productInactiveId: `product-inact-${stamp}`,
    postPublishedId: `post-pub-${stamp}`,
    postDraftId: `post-draft-${stamp}`,
    postXssId: `post-xss-${stamp}`,
    productActiveSlug: `e2e-active-${stamp}`,
    productInactiveSlug: `e2e-inactive-${stamp}`,
    postPublishedSlug: `e2e-published-${stamp}`,
    postDraftSlug: `e2e-draft-${stamp}`,
    postXssSlug: `e2e-xss-${stamp}`,
  };

  const writes = await Promise.all([
    admin('/admin/api/products', { method: 'POST', body: JSON.stringify(productPayload(state.productActiveId, state.productActiveSlug, 'E2E ACTIVE PROBE', 'active')) }),
    admin('/admin/api/products', { method: 'POST', body: JSON.stringify(productPayload(state.productInactiveId, state.productInactiveSlug, 'E2E INACTIVE PROBE', 'inactive')) }),
    admin('/admin/api/posts', { method: 'POST', body: JSON.stringify(postPayload(state.postPublishedId, state.postPublishedSlug, 'E2E published probe', 'published', 'Published body paragraph.')) }),
    admin('/admin/api/posts', { method: 'POST', body: JSON.stringify(postPayload(state.postDraftId, state.postDraftSlug, 'E2E draft probe', 'draft', 'Draft body paragraph.')) }),
    admin('/admin/api/posts', { method: 'POST', body: JSON.stringify(postPayload(state.postXssId, state.postXssSlug, 'E2E XSS probe', 'published', 'Plain paragraph with <script>alert("xss")</script> inside.\n\n## <img src=x onerror=alert(1)>')) }),
  ]);
  const statuses = writes.map((r) => r.status);
  check(
    'wrote active+inactive products and published+draft+xss posts',
    statuses.every((s) => s === 200),
    `HTTP ${statuses.join('/')} ${writes.find((r) => r.status !== 200)?.body?.error ?? ''}`,
  );

  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`state written to ${STATE.pathname}`);
  finish();
}

async function checkPhase() {
  await login();
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));

  try {
    const shop = await page('/shop');
    check('/shop shows the ACTIVE product', shop.status === 200 && shop.html.includes('E2E ACTIVE PROBE'), `HTTP ${shop.status}`);
    check('/shop hides the INACTIVE product', shop.status === 200 && !shop.html.includes('E2E INACTIVE PROBE'), `HTTP ${shop.status}`);

    const detailOn = await page(`/products/${state.productActiveSlug}`);
    check('active product detail renders on demand', detailOn.status === 200 && detailOn.html.includes('E2E ACTIVE PROBE') && detailOn.html.includes('Probe paragraph one'), `HTTP ${detailOn.status}`);
    const detailOff = await page(`/products/${state.productInactiveSlug}`);
    check('inactive product detail does not render', detailOff.status !== 200, `HTTP ${detailOff.status}`);

    const blog = await page('/blog');
    check('/blog shows the published post', blog.status === 200 && blog.html.includes('E2E published probe'), `HTTP ${blog.status}`);
    check('/blog hides the draft', blog.status === 200 && !blog.html.includes('E2E draft probe'), `HTTP ${blog.status}`);

    const noteOn = await page(`/blog/${state.postPublishedSlug}`);
    check('published post route renders its body', noteOn.status === 200 && noteOn.html.includes('Published body paragraph'), `HTTP ${noteOn.status}`);
    const noteOff = await page(`/blog/${state.postDraftSlug}`);
    check('draft post route does not render', noteOff.status !== 200, `HTTP ${noteOff.status}`);

    const xss = await page(`/blog/${state.postXssSlug}`);
    const hasExecutable = /<script>alert\(/.test(xss.html);
    const escapedBody = xss.html.includes('&lt;script&gt;');
    const escapedHeading = xss.html.includes('&lt;img');
    check(
      'script payload renders as text, never as script',
      xss.status === 200 && !hasExecutable && escapedBody && escapedHeading,
      `HTTP ${xss.status}; executable=${hasExecutable}; escapedBody=${escapedBody}; escapedHeading=${escapedHeading}`,
    );
  } finally {
    for (const [id, kind] of [
      [state.productActiveId, 'products'],
      [state.productInactiveId, 'products'],
      [state.postPublishedId, 'posts'],
      [state.postDraftId, 'posts'],
      [state.postXssId, 'posts'],
    ]) {
      await admin(`/admin/api/${kind}?id=${id}`, { method: 'DELETE' });
    }
    fs.rmSync(STATE, { force: true });
  }

  const shop2 = await page('/shop');
  check('probes gone from /shop after cleanup', !shop2.html.includes('E2E ACTIVE PROBE'), `HTTP ${shop2.status}`);
  finish();
}

const phase = process.argv[2];
if (phase === 'write') await writePhase();
else if (phase === 'check') await checkPhase();
else {
  console.error('usage: node e2e-storefront.mjs <write|check>');
  process.exit(2);
}
