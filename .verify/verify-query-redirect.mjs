/* Post-fix proof of the redirect chain — query param IN → baked into the
 * link → /verify 303s to /admin/auth/callback with tokens in the fragment →
 * POST /admin/api/auth/session (what the callback page does) → cookie →
 * /admin/api/auth/me confirms the allowlisted identity.
 * Prints booleans and status codes only; never tokens. */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN = 'https://cra7ty-hub-admin.vercel.app';
const CALLBACK = `${ADMIN}/admin/auth/callback`;
const EMAIL = 'michinedu7@gmail.com';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  /* 1. generate a link WITH the redirect on the query string (the channel
     the fix now uses for /otp; generate_link's builder shares GoTrue's
     redirect plumbing — getRedirectTo reads query/form/header) */
  const genRes = await fetch(
    `${SUPA}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(CALLBACK)}`,
    {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
    },
  );
  const gen = await genRes.json();
  check('generate_link (?redirect_to= on query) → 200', genRes.status === 200, `HTTP ${genRes.status}`);
  check(
    'GoTrue echoes the query redirect_to back',
    gen.redirect_to === CALLBACK,
    `got: ${gen.redirect_to}`,
  );
  const action = String(gen.action_link ?? '');
  const redirectInLink = decodeURIComponent(action).includes(
    `redirect_to=${CALLBACK}`,
  );
  check('baked action_link contains the callback redirect', redirectInLink);

  /* 2. GET the link — where does /verify send a VALID token? */
  const verifyRes = await fetch(action, { redirect: 'manual' });
  const loc = verifyRes.headers.get('location') ?? '';
  const landsOnCallback =
    loc.startsWith(`${CALLBACK}#`) && loc.includes('access_token=');
  check(
    '/verify 303 → /admin/auth/callback with tokens in fragment',
    verifyRes.status === 303 && landsOnCallback,
    `HTTP ${verifyRes.status}; location host/path: ${(() => { try { const u = new URL(loc); return u.pathname + (u.hash ? '#…' : ''); } catch { return loc.slice(0, 60); } })()}`,
  );

  /* 3. simulate exactly what the callback page JS does with that fragment */
  const hash = new URL(loc).hash.slice(1);
  const hp = new URLSearchParams(hash);
  const access_token = hp.get('access_token') ?? '';
  const refresh_token = hp.get('refresh_token') ?? '';
  const expires_in = Number(hp.get('expires_in') ?? '3600');
  check('fragment carries a full session pair', Boolean(access_token && refresh_token));

  const sessRes = await fetch(`${ADMIN}/admin/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token, refresh_token, expires_in }),
  });
  const setCookie = sessRes.headers.get('set-cookie') ?? '';
  check('POST /admin/api/auth/session → 200 + cookie', sessRes.status === 200 && setCookie.includes('ch_admin_session'), `HTTP ${sessRes.status}`);
  const cookie = setCookie.split(';')[0];

  /* 4. authenticated API call with that cookie */
  const meRes = await fetch(`${ADMIN}/admin/api/auth/me`, { headers: { cookie } });
  const me = await meRes.json().catch(() => ({}));
  check(
    'GET /admin/api/auth/me → allowlisted email',
    meRes.status === 200 && me.email === EMAIL,
    `HTTP ${meRes.status}; email=${me.email ?? '(none)'}`,
  );

  /* 5. authenticated page (middleware) reachable — /admin may legitimately
     bounce to /admin/dashboard; only a bounce to /admin/login means the
     middleware rejected the session. */
  const dashRes = await fetch(`${ADMIN}/admin/dashboard`, {
    headers: { cookie },
    redirect: 'manual',
  });
  check(
    'GET /admin/dashboard with session → 200 (middleware lets it through)',
    dashRes.status === 200,
    `HTTP ${dashRes.status}${dashRes.headers.get('location') ? ` → ${dashRes.headers.get('location')}` : ''}`,
  );
  /* diagnostic: the /admin index route (its own redirect() behaviour) */
  const pageRes = await fetch(`${ADMIN}/admin`, {
    headers: { cookie },
    redirect: 'manual',
  });
  console.log(
    `  note: GET /admin → HTTP ${pageRes.status}; headers:`,
    JSON.stringify(Object.fromEntries(pageRes.headers.entries())).slice(0, 400),
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
