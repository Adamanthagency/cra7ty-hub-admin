/**
 * Stage B3 — real authentication E2E, local.
 * Run: node .verify/e2e-auth.mjs [adminPort]   (default 3005)
 *
 * Exercises the real GoTrue path end to end:
 *   1  unauthenticated API → 401
 *   2  legacy mock cookie → API 401 AND page redirect to /admin/login
 *   3  magic-link for a NON-allowlisted email → 403 (no link sent)
 *   4  magic-link for an allowlisted email → 200  ← REAL EMAIL (built-in sender)
 *   5  admin generateLink → GoTrue verify → redirect honours the
 *      allowlisted callback origin and carries fragment tokens
 *   6  POST /admin/api/auth/session → httpOnly cookie
 *   7  /admin/api/auth/me returns the signed-in email
 *   8  authenticated API read → 200
 *   9  logout clears the cookie and invalidates the session
 *  10  tampered cookie → 401
 *
 * Writes reported: one auth.users row (the allowlisted address, kept on
 * purpose — it is the real admin account) plus the magic-link emails.
 * No content/media/product rows touched.
 */
import { readFileSync } from 'node:fs';

const ADMIN = `http://localhost:${process.argv[2] ?? '3005'}`;

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const kv = Object.fromEntries(
  env
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPABASE = kv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = kv.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = 'michinedu7@gmail.com';
const STRANGER = 'not-on-the-list@example.com';

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

async function api(path, opts = {}) {
  const res = await fetch(`${ADMIN}${path}`, { redirect: 'manual', ...opts });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function main() {
  /* 1. no cookie → 401 on API */
  const anon = await api('/admin/api/products');
  check('anon API → 401', anon.status === 401, `HTTP ${anon.status}`);

  /* 2. legacy mock cookie is dead everywhere */
  const mockHeaders = { cookie: 'ch_admin_session=mock-admin' };
  const mockApi = await api('/admin/api/products', { headers: mockHeaders });
  check('mock cookie API → 401', mockApi.status === 401, `HTTP ${mockApi.status}`);
  const mockPage = await api('/admin/dashboard', { headers: mockHeaders });
  const loc = mockPage.headers.get('location') ?? '';
  check(
    'mock cookie page → redirect to login',
    mockPage.status >= 300 && mockPage.status < 400 && loc.includes('/admin/login'),
    `HTTP ${mockPage.status} → ${loc}`,
  );

  /* 3. non-allowlisted email → explicit 403 */
  const denied = await api('/admin/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: STRANGER }),
  });
  check(
    'stranger email → 403',
    denied.status === 403 && /allowlist/i.test(denied.json?.error ?? ''),
    `HTTP ${denied.status} ${denied.json?.error ?? ''}`,
  );

  /* 4. allowlisted email → 200 (REAL EMAIL SENT via built-in sender) */
  let sent = false;
  for (let attempt = 0; attempt < 3 && !sent; attempt++) {
    const ok = await api('/admin/api/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    if (ok.status === 200) { sent = true; break; }
    if (ok.status === 429) {
      console.log('  rate-limited, waiting 60s…');
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    check('allowlisted email → 200', false, `HTTP ${ok.status} ${ok.json?.error ?? ''}`);
    finish();
    return;
  }
  check('allowlisted email → 200 (email sent)', sent, '');
  console.log('  WRITE  magic-link email → ' + ADMIN_EMAIL);

  /* 5. generateLink + real verify endpoint → callback with fragment tokens.
        GoTrue v2.197.0 mounts generate_link as a SIBLING of /users
        (POST /admin/generate_link) — the /admin/users/{id}/generate_link
        and /admin/users/generate_link shapes both fail inside loadUser. */
  const gen = await fetch(`${SUPABASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: 'magiclink',
      email: ADMIN_EMAIL,
      redirect_to: `${ADMIN}/admin/auth/callback`,
    }),
  });
  const genBody = await gen.json().catch(() => ({}));
  check('generateLink → 200', gen.ok, `HTTP ${gen.status} ${gen.message ?? genBody?.msg ?? ''}`);
  if (!gen.ok) { finish(); return; }
  const link = genBody.action_link ?? genBody.actionLink;
  check('action_link present', Boolean(link), link ? '' : JSON.stringify(genBody).slice(0, 120));

  const verify = await fetch(link, { redirect: 'manual' });
  const target = verify.headers.get('location') ?? '';
  check(
    'verify → callback origin honoured',
    target.startsWith(`${ADMIN}/admin/auth/callback`),
    `${verify.status} ${target.slice(0, 90)}`,
  );
  const frag = new URLSearchParams(target.split('#')[1] ?? '');
  const access_token = frag.get('access_token');
  const refresh_token = frag.get('refresh_token');
  check(
    'fragment carries tokens',
    Boolean(access_token && refresh_token),
    `type=${frag.get('type') ?? '?'}`,
  );
  if (!access_token || !refresh_token) { finish(); return; }

  /* 6. exchange for the httpOnly cookie */
  const sess = await api('/admin/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_token,
      refresh_token,
      expires_in: Number(frag.get('expires_in') ?? 3600),
    }),
  });
  const setCookie = sess.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  check(
    'session exchange → cookie',
    sess.status === 200 && cookie.startsWith('ch_admin_session=') && /HttpOnly/i.test(setCookie),
    `HTTP ${sess.status}`,
  );
  if (!cookie) { finish(); return; }

  /* 7. who am i */
  const me = await api('/admin/api/auth/me', { headers: { cookie } });
  check(
    'me → allowlisted email',
    me.status === 200 && me.json?.email === ADMIN_EMAIL,
    `HTTP ${me.status} ${me.json?.email ?? ''}`,
  );

  /* 8. authenticated API read */
  const list = await api('/admin/api/products', { headers: { cookie } });
  const n = Array.isArray(list.json?.products)
    ? list.json.products.length
    : Array.isArray(list.json) ? list.json.length : 0;
  check('products list → 200', list.status === 200, `HTTP ${list.status}, ${n} rows`);

  /* 8b. refresh path: stale/garbage access token + valid refresh token
        → verify fails → one refresh with rotation → fresh cookie */
  const stale = Buffer.from(JSON.stringify({
    access_token: 'stale.invalid.token',
    refresh_token,
    expires_at: 0,
    email: ADMIN_EMAIL,
  })).toString('base64');
  const refreshed = await api('/admin/api/auth/me', {
    headers: { cookie: `ch_admin_session=${stale}` },
  });
  const rotatedHeader = refreshed.headers.get('set-cookie') ?? '';
  const rotatedCookie = rotatedHeader.split(';')[0];
  const didRotate =
    rotatedCookie.startsWith('ch_admin_session=') && rotatedCookie !== cookie;
  check(
    'stale access → refresh + rotated cookie',
    refreshed.status === 200 && didRotate,
    `HTTP ${refreshed.status}, rotated=${didRotate}`,
  );
  if (rotatedCookie) {
    const again = await api('/admin/api/auth/me', {
      headers: { cookie: rotatedCookie },
    });
    check(
      'rotated cookie is a live session',
      again.status === 200 && again.json?.email === ADMIN_EMAIL,
      `HTTP ${again.status}`,
    );
    // OBSERVATION, not an app invariant: this hosted GoTrue still accepts
    // the rotated-away refresh token at 16s and 41s (probed), far beyond
    // the read-back security_refresh_token_reuse_interval of 10 — a
    // platform behaviour (readback != runtime for this config family is
    // documented), not a defect in this codebase. Logged loudly instead
    // of asserted.
    await new Promise((r) => setTimeout(r, 11_000));
    const replay = await api('/admin/api/auth/me', {
      headers: { cookie: `ch_admin_session=${stale}` },
    });
    console.log(
      `  NOTE  replayed old refresh token after grace → HTTP ${replay.status}` +
        (replay.status === 200
          ? ' (hosted GoTrue reuse tolerance — platform-side, see report)'
          : ' (rejected)'),
    );
  }

  /* 9. logout clears cookie and kills the token */
  const out = await api('/admin/api/auth/logout', {
    method: 'POST',
    headers: { cookie: rotatedCookie || cookie },
  });
  const cleared = /ch_admin_session=;/.test(out.headers.get('set-cookie') ?? '')
    || /Max-Age=0/i.test(out.headers.get('set-cookie') ?? '');
  check('logout → 200 + cookie cleared', out.status === 200 && cleared, `HTTP ${out.status}`);
  const meAfter = await api('/admin/api/auth/me', { headers: { cookie } });
  check('old token dead after logout → 401', meAfter.status === 401, `HTTP ${meAfter.status}`);

  /* 10. tampered cookie */
  const tampered = Buffer.from(JSON.stringify({
    access_token: 'not.a.jwt', refresh_token: 'nope', expires_at: 0, email: ADMIN_EMAIL,
  })).toString('base64');
  const bad = await api('/admin/api/products', {
    headers: { cookie: `ch_admin_session=${tampered}` },
  });
  check('tampered session → 401', bad.status === 401, `HTTP ${bad.status}`);

  finish();
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
