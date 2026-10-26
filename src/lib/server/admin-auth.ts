import { NextResponse } from 'next/server';

/**
 * Supabase magic-link session handling for the admin, over plain GoTrue
 * REST — no SDK (the admin never needed one, and the plan forbids new
 * dependencies).
 *
 * The session lives in an httpOnly `ch_admin_session` cookie as
 * base64(JSON). The old mock cookie held the literal string
 * `mock-admin`, which fails to decode as JSON — pre-migration cookies
 * are rejected by construction, so no half-migrated state can pass.
 *
 * This module is edge-safe (fetch / btoa / atob only, no Buffer, no
 * service-role key) so middleware can import it. Anything that touches
 * the service-role key belongs in a route module, never here.
 */

export type AdminSession = {
  access_token: string;
  refresh_token: string;
  /** epoch seconds when the access token dies */
  expires_at: number;
  email: string;
};

export const SESSION_COOKIE = 'ch_admin_session';
export const SESSION_COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === 'production',
} as const;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** JSON → cookie-safe base64. */
export function encodeSession(session: AdminSession): string {
  return btoa(JSON.stringify(session));
}

/** Cookie → session. Throws on anything that is not our format — the
 *  legacy `mock-admin` value lands here and dies. */
export function decodeSession(raw: string): AdminSession {
  const parsed = JSON.parse(atob(raw)) as Partial<AdminSession>;
  if (
    typeof parsed.access_token !== 'string' ||
    typeof parsed.refresh_token !== 'string' ||
    typeof parsed.email !== 'string'
  ) {
    throw new Error('malformed session');
  }
  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
    expires_at: typeof parsed.expires_at === 'number' ? parsed.expires_at : 0,
    email: parsed.email,
  };
}

/** Ask GoTrue who this access token belongs to. null = dead/invalid. */
export async function verifyAccessToken(
  accessToken: string,
): Promise<{ email: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok) return null;
  const user = (await res.json().catch(() => null)) as { email?: string } | null;
  return user?.email ? { email: user.email } : null;
}

/** Exchange a refresh token for a fresh session (rotation-aware: GoTrue
 *  returns a new refresh token; we persist it immediately). */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<AdminSession | null> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { email?: string };
  } | null;
  if (!data?.access_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    email: data.user?.email ?? '',
  };
}

/**
 * Raw cookie → live session: decode, verify, and refresh+rotate once if
 * verification failed. `updated` is set only when rotation happened —
 * callers must persist it (middleware rewrites the request cookie,
 * routes set it on their response) or the rotated refresh token is lost
 * and the user is logged out on the next request.
 */
export async function resolveSession(
  raw: string | undefined,
): Promise<{ session: AdminSession | null; updated?: string }> {
  if (!raw) return { session: null };

  let parsed: AdminSession;
  try {
    parsed = decodeSession(raw);
  } catch {
    return { session: null };
  }

  const live = await verifyAccessToken(parsed.access_token);
  if (live) return { session: { ...parsed, email: live.email } };

  const refreshed = await refreshAccessToken(parsed.refresh_token);
  if (refreshed) return { session: refreshed, updated: encodeSession(refreshed) };

  return { session: null };
}

/** JSON 401 every /admin/api/* route returns when the session is dead. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}
