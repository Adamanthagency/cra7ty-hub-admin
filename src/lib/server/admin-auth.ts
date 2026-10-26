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

/**
 * Why a session check failed. `unauthorized` means GoTrue answered and
 * said the token is bad (a real logout). `unreachable` means we could not
 * reach GoTrue at all (network error / 5xx / timeout after one retry) —
 * this is NOT a logout and must never be treated as one.
 */
export type AuthFailure = 'unauthorized' | 'unreachable';

/** Per-attempt budget; two attempts (this one + one retry) cap the wait. */
const AUTH_TIMEOUT_MS = 5000;
/** Backoff before the single retry on a transient failure. */
const AUTH_RETRY_MS = 400;

/** Ask GoTrue who this access token belongs to. */
export async function verifyAccessToken(
  accessToken: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: AuthFailure }> {
  // A transient GoTrue/network blip must not look like a dead token, so a
  // network error / 5xx / timeout gets one retry before we call it
  // `unreachable`; only a real 401/403 is a genuine rejection.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, AUTH_RETRY_MS));
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch {
      continue; // network error or timeout — retry, then unreachable
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorized' };
    }
    if (!res.ok) continue; // 5xx (and anything else non-401) — retry
    const user = (await res.json().catch(() => null)) as { email?: string } | null;
    // 200 but no email: the token resolved to no usable identity.
    if (!user?.email) return { ok: false, reason: 'unauthorized' };
    return { ok: true, email: user.email };
  }
  return { ok: false, reason: 'unreachable' };
}

/** Exchange a refresh token for a fresh session (rotation-aware: GoTrue
 *  returns a new refresh token; we persist it immediately). */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ ok: true; session: AdminSession } | { ok: false; reason: AuthFailure }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, AUTH_RETRY_MS));
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: 'no-store',
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
    } catch {
      continue; // network error or timeout — retry, then unreachable
    }
    // 400 (invalid_grant — the refresh token itself is dead) / 401 / 403 are
    // the real "your session is over" signal → a genuine logout.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorized' };
    }
    if (!res.ok) continue; // 429 / 5xx — transient, retry
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { email?: string };
    } | null;
    // 200 but no token: the grant produced no usable session.
    if (!data?.access_token) return { ok: false, reason: 'unauthorized' };
    return {
      ok: true,
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
        email: data.user?.email ?? '',
      },
    };
  }
  return { ok: false, reason: 'unreachable' };
}

/**
 * Raw cookie → live session: decode, verify, and refresh+rotate once if
 * verification failed. `updated` is set only when rotation happened —
 * callers must persist it (middleware rewrites the request cookie,
 * routes set it on their response) or the rotated refresh token is lost
 * and the user is logged out on the next request.
 *
 * `error` says WHY there is no session: `unauthorized` (a real rejection —
 * log the caller out) or `unreachable` (GoTrue could not be reached — do
 * NOT log the caller out; the session may still be perfectly valid).
 */
export async function resolveSession(
  raw: string | undefined,
): Promise<{ session: AdminSession | null; updated?: string; error?: AuthFailure }> {
  // No cookie or a malformed one (e.g. the legacy `mock-admin` value) is a
  // genuine "not signed in", not an outage.
  if (!raw) return { session: null, error: 'unauthorized' };

  let parsed: AdminSession;
  try {
    parsed = decodeSession(raw);
  } catch {
    return { session: null, error: 'unauthorized' };
  }

  const live = await verifyAccessToken(parsed.access_token);
  if (live.ok) return { session: { ...parsed, email: live.email } };

  // GoTrue is unreachable: refreshing would hit the same dead host and a
  // rotation attempt must not run against an outage, so skip it and report
  // `unreachable` — the caller keeps the session and retries later.
  if (live.reason === 'unreachable') {
    return { session: null, error: 'unreachable' };
  }

  const refreshed = await refreshAccessToken(parsed.refresh_token);
  if (refreshed.ok) {
    return { session: refreshed.session, updated: encodeSession(refreshed.session) };
  }

  // distinguish a dead refresh token (unauthorized) from an unreachable GoTrue
  return { session: null, error: refreshed.reason };
}

/** JSON 401 every /admin/api/* route returns when the session is dead. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

/** JSON 503 when GoTrue is unreachable — NOT a logout; the session is kept. */
export function serviceUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Can't verify your session right now — the auth service is unreachable. Your session has not been cleared; please retry in a moment.",
    },
    { status: 503 },
  );
}
