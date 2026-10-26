/**
 * Shared real-session login for the .verify scripts — replaces the
 * deleted /admin/api/mock-login flow.
 *
 * Path: GoTrue admin generate_link (service key, no email sent) → real
 * verify endpoint (303 carries fragment tokens) → POST
 * /admin/api/auth/session on the admin being tested → httpOnly cookie.
 * Fully offline from the mailbox: no emails are sent by this helper
 * (generate_link only builds the link; /otp is the only sender and only
 * e2e-auth.mjs uses it).
 *
 * Works against any admin origin (localhost or Vercel): if the
 * callback origin isn't allowlisted the verify redirect falls back to
 * site_url — the fragment still carries the tokens, which is all we
 * parse.
 */
import { readFileSync } from 'node:fs';

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

const SUPABASE_URL = kv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = kv.SUPABASE_SERVICE_ROLE_KEY;

/** The allowlisted admin address used by tests. */
export const VERIFY_ADMIN_EMAIL = 'michinedu7@gmail.com';

/** Returns the `ch_admin_session=…` cookie string. Throws on failure. */
export async function adminLogin(adminOrigin, email = VERIFY_ADMIN_EMAIL) {
  if (!SUPABASE_URL || !SERVICE) {
    throw new Error('.env.local missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }

  const gen = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: 'magiclink',
      email,
      redirect_to: `${adminOrigin}/admin/auth/callback`,
    }),
  });
  const genBody = await gen.json().catch(() => ({}));
  if (!gen.ok) {
    throw new Error(`generate_link HTTP ${gen.status} ${genBody?.msg ?? ''}`);
  }
  const link = genBody.action_link;
  if (!link) throw new Error('generate_link returned no action_link');

  const verify = await fetch(link, { redirect: 'manual' });
  const location = verify.headers.get('location') ?? '';
  const frag = new URLSearchParams(location.split('#')[1] ?? '');
  const access_token = frag.get('access_token');
  const refresh_token = frag.get('refresh_token');
  if (!access_token || !refresh_token) {
    throw new Error(`verify redirect carried no tokens: ${location.slice(0, 120)}`);
  }

  const sess = await fetch(`${adminOrigin}/admin/api/auth/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_token,
      refresh_token,
      expires_in: Number(frag.get('expires_in') ?? 3600),
    }),
  });
  if (!sess.ok) {
    throw new Error(`session exchange HTTP ${sess.status}`);
  }
  const setCookie = sess.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  if (!cookie.startsWith('ch_admin_session=')) {
    throw new Error('session exchange set no ch_admin_session cookie');
  }
  return cookie;
}
