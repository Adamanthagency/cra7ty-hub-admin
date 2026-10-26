/* Phase 1 evidence: where does GoTrue's /verify actually send us?
 * Run: node .verify/debug-redirect.mjs
 * Never prints tokens — action links are redacted to their param skeleton. */
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
const ADMIN_ORIGIN = 'https://cra7ty-hub-admin.vercel.app';
const CALLBACK = `${ADMIN_ORIGIN}/admin/auth/callback`;
const EMAIL = 'michinedu7@gmail.com';

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

/** Replace token values with <redacted>, keep the param names/order. */
function skeleton(url) {
  return url
    .replace(/([?&](?:token|token_hash|refresh_token|access_token)=)[^&]*/gi, '$1<redacted>')
    .replace(/([?&]hash=)[^&]*/gi, '$1<redacted>');
}

async function main() {
  /* 1. find the auth user */
  const usersRes = await fetch(
    `${SUPA}/auth/v1/admin/users?email=eq.${encodeURIComponent(EMAIL)}`,
    { headers: svc },
  );
  const body = await usersRes.json();
  const users = Array.isArray(body) ? body : (body?.users ?? []);
  const user = users[0];
  console.log(`user lookup: HTTP ${usersRes.status}, ${users.length} match(es)`);
  if (!user) {
    console.log('NO USER — cannot generate a link');
    process.exit(1);
  }

  /* 2. generate a real magic_link */
  console.log('  user id shape:', /^\d+-[0-9a-f]+$/i.test(String(user.id)) ? 'uuid-ish' : String(user.id).slice(0, 12));
  const genRes = await fetch(`${SUPA}/auth/v1/admin/users/${user.id}/generate_link`, {
    method: 'POST',
    headers: { ...svc, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magic_link' }),
  });
  const genText = await genRes.text();
  console.log(`generate_link: HTTP ${genRes.status} content-type=${genRes.headers.get('content-type')}`);
  if (!genRes.ok) {
    console.log('raw body:', genText.slice(0, 300));
    process.exit(1);
  }
  const gen = JSON.parse(genText);
  const action = gen.action_link ?? '';
  console.log('  verification_type:', gen.verification_type);
  console.log('  redirect_to field :', gen.redirect_to ?? '(none)');
  console.log('  action_link       :', skeleton(action));
  console.log('  action has redirect_to param:', action.includes('redirect_to='));

  /* 3. baseline: GET the link exactly as generate_link issued it */
  const baseline = await fetch(action, { redirect: 'manual' });
  console.log(
    `\n[as issued] GET → ${baseline.status} ${baseline.headers.get('location') ?? '(no location)'}`,
  );

  /* 4. THE test: same link + the route's exact redirect_to value */
  const sep = action.includes('?') ? '&' : '?';
  const withRedirect = action + sep + 'redirect_to=' + encodeURIComponent(CALLBACK);
  const test = await fetch(withRedirect, { redirect: 'manual' });
  console.log(
    `[+callback redirect_to] GET → ${test.status} ${test.headers.get('location') ?? '(no location)'}`,
  );

  /* 5. control: a redirect_to the allowlist definitely should NOT match */
  const evil = await fetch(
    action + sep + 'redirect_to=' + encodeURIComponent('https://evil.example.com/steal'),
    { redirect: 'manual' },
  );
  console.log(
    `[+foreign redirect_to] GET → ${evil.status} ${evil.headers.get('location') ?? '(no location)'}`,
  );
}

main();
