import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  encodeSession,
  verifyAccessToken,
} from '@/lib/server/admin-auth';

/**
 * POST /admin/api/auth/session  { access_token, refresh_token, expires_in }
 *
 * The callback page hands us the tokens the magic-link redirect carried
 * in its URL fragment. We verify them against GoTrue BEFORE believing
 * them, then stash the session in an httpOnly cookie. Tokens are never
 * rendered, never logged, never exposed to any other client code.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  } | null;

  const access_token = typeof body?.access_token === 'string' ? body.access_token : '';
  const refresh_token = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
  const expires_in = typeof body?.expires_in === 'number' ? body.expires_in : 3600;

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing session tokens.' }, { status: 400 });
  }

  const user = await verifyAccessToken(access_token);
  if (!user) {
    return NextResponse.json({ error: 'Link is no longer valid.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, email: user.email });
  res.cookies.set(
    SESSION_COOKIE,
    encodeSession({
      access_token,
      refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + expires_in,
      email: user.email,
    }),
    SESSION_COOKIE_OPTS,
  );
  console.log('[auth] session established');
  return res;
}
