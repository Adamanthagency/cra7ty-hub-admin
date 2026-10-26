/**
 * Stage B4 — live authentication E2E against PRODUCTION.
 * Run: node .verify/e2e-auth-live.mjs
 *
 *   1  anonymous GET /admin/login → 200 (production is no longer SSO-walled)
 *   2  a PREVIOUS preview deployment → still protected (401)
 *   3  real magic-link send through custom SMTP (Resend) → 200
 *      (the email itself lands in the admin's mailbox — a real send,
 *      not generate_link; GoTrue only answers 200 once SMTP accepted it)
 *   4  non-allowlisted email → 403, no link
 *   5  legacy mock cookie → API 401 + page redirect to /admin/login
 *   6  full login completion (generate_link → verify → session) on the
 *      production origin, then /admin/api/auth/me → allowlisted email
 *   7  authenticated page (middleware) → 200, not redirected
 *   8  logout → cookie cleared, session dead
 *   9  storefront revalidate endpoint rejects a WRONG secret
 *  10  variants render live on a real product (origami), and a
 *      zero-variant product has no picker
 *
 * Writes reported: one magic-link email (to the real admin mailbox),
 * auth bookkeeping on the allowlisted account. No content/product rows.
 */
import { adminLogin, VERIFY_ADMIN_EMAIL } from './lib-auth.mjs';

const ADMIN = 'https://cra7ty-hub-admin.vercel.app';
const SHOP = 'https://www.cra7tyhub.com';
/**
 * NOTE on the preview-protection check: this project has NEVER had a
 * preview deployment (every deployment is Production — old hash URLs
 * are production URLs, correctly unprotected under deploymentType
 * preview). The setting itself is asserted via `vercel project
 * protection` (ssoProtection.deploymentType must equal `preview`), and
 * a live probe is impossible until a branch push creates a preview.
 */

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

async function hit(url, opts = {}) {
  const res = await fetch(url, { redirect: 'manual', ...opts });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function main() {
  /* 1. production admin reachable without SSO wall */
  const loginPage = await hit(`${ADMIN}/admin/login`);
  check('prod /admin/login → 200 (SSO wall off)', loginPage.status === 200, `HTTP ${loginPage.status}`);

  /* 2. protection SETTING: previews protected, production open */
  const fs = await import('node:fs');
  let deploymentType = 'unreadable';
  try {
    const auth = JSON.parse(
      fs.readFileSync(
        `${process.env.APPDATA}/xdg.data/com.vercel.cli/auth.json`,
        'utf8',
      ),
    );
    const proj = await fetch(
      'https://api.vercel.com/v9/projects/prj_NyXBfZeOICoMFtUN0ur6ifLyHIXt',
      {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-vercel-team-id': 'team_rMcl2tLha8Q2aeSzNZsIgalF',
        },
      },
    );
    const body = await proj.json();
    deploymentType = body?.ssoProtection?.deploymentType ?? 'null';
  } catch (e) {
    deploymentType = `error: ${e.message}`;
  }
  check(
    'protection setting = preview-only (prod open, previews gated)',
    deploymentType === 'preview',
    `deploymentType=${deploymentType}`,
  );

  /* 3. REAL magic-link send through Resend SMTP */
  const send = await hit(`${ADMIN}/admin/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: VERIFY_ADMIN_EMAIL }),
  });
  check(
    'real magic-link send via Resend → 200',
    send.status === 200,
    `HTTP ${send.status} ${send.json?.error ?? ''}`,
  );
  console.log(`  WRITE  magic-link email (Resend) → ${VERIFY_ADMIN_EMAIL}`);

  /* 4. stranger → 403 */
  const denied = await hit(`${ADMIN}/admin/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-on-the-list@example.com' }),
  });
  check(
    'non-allowlisted email → 403',
    denied.status === 403 && /allowlist/i.test(denied.json?.error ?? ''),
    `HTTP ${denied.status} ${denied.json?.error ?? ''}`,
  );

  /* 5. legacy mock cookie is dead everywhere */
  const mockApi = await hit(`${ADMIN}/admin/api/products`, {
    headers: { cookie: 'ch_admin_session=mock-admin' },
  });
  check('mock cookie API → 401', mockApi.status === 401, `HTTP ${mockApi.status}`);
  const mockPage = await hit(`${ADMIN}/admin/dashboard`, {
    headers: { cookie: 'ch_admin_session=mock-admin' },
  });
  const loc = mockPage.headers.get('location') ?? '';
  check(
    'mock cookie page → redirect to login',
    mockPage.status >= 300 && mockPage.status < 400 && loc.includes('/admin/login'),
    `HTTP ${mockPage.status} → ${loc.slice(0, 60)}`,
  );

  /* 6. complete a login on the production origin */
  let cookie = null;
  try {
    cookie = await adminLogin(ADMIN);
    check('login → cookie on prod origin', Boolean(cookie));
  } catch (e) {
    check('login → cookie on prod origin', false, e.message);
    finish();
    return;
  }
  const me = await hit(`${ADMIN}/admin/api/auth/me`, { headers: { cookie } });
  check(
    'me → allowlisted email',
    me.status === 200 && me.json?.email === VERIFY_ADMIN_EMAIL,
    `HTTP ${me.status} ${me.json?.email ?? ''}`,
  );

  /* 7. middleware lets the page through with a live session */
  const dash = await hit(`${ADMIN}/admin/dashboard`, { headers: { cookie } });
  check(
    'authed page → 200 (no redirect)',
    dash.status === 200,
    `HTTP ${dash.status} → ${(dash.headers.get('location') ?? '').slice(0, 60)}`,
  );

  /* 8. logout kills it */
  const out = await hit(`${ADMIN}/admin/api/auth/logout`, {
    method: 'POST',
    headers: { cookie },
  });
  const cleared = /ch_admin_session=;/.test(out.headers.get('set-cookie') ?? '')
    || /Max-Age=0/i.test(out.headers.get('set-cookie') ?? '');
  check('logout → 200 + cookie cleared', out.status === 200 && cleared, `HTTP ${out.status}`);
  const meAfter = await hit(`${ADMIN}/admin/api/auth/me`, { headers: { cookie } });
  check('session dead after logout → 401', meAfter.status === 401, `HTTP ${meAfter.status}`);

  /* 9. storefront revalidate rejects a wrong secret */
  const badSecret = await hit(`${SHOP}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-secret-not-the-real-one' },
    body: JSON.stringify({ paths: ['/'] }),
  });
  check(
    'revalidate wrong secret → rejected',
    badSecret.status === 401 || badSecret.status === 403,
    `HTTP ${badSecret.status}`,
  );
  const noSecret = await hit(`${SHOP}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: ['/'] }),
  });
  check(
    'revalidate missing secret → rejected',
    noSecret.status === 401 || noSecret.status === 403,
    `HTTP ${noSecret.status}`,
  );

  /* 10. variants live on a real product */
  const variantProduct = await hit(`${SHOP}/products/origami`, { headers: { 'cache-control': 'no-cache' } });
  check('real variant product → 200', variantProduct.status === 200, `HTTP ${variantProduct.status}`);
  check(
    'variant picker renders live (colour axis + swatch)',
    variantProduct.text.includes('variant-axis-colour'),
    '',
  );
  const plain = await hit(`${SHOP}/products/origami-crane-single`);
  check(
    'zero-variant product: no picker live',
    plain.status === 200 && !plain.text.includes('variant-axis-'),
    `HTTP ${plain.status}`,
  );

  finish();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
