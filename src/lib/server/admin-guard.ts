import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  resolveSession,
  serviceUnavailable,
  type AdminSession,
} from './admin-auth';

/**
 * Route-handler session gate: every /admin/api/* handler calls this
 * instead of checking cookie presence. Performs a REAL Supabase check
 * (verify → single refresh with rotation) and persists a rotated token
 * onto the outgoing response via the route's cookie store, so a refresh
 * that happens inside a route is never lost.
 *
 * Returns the live session on success, or a 401 NextResponse the caller
 * must return as-is:
 *
 *   const guard = await requireAdmin(request);
 *   if (guard instanceof NextResponse) return guard;
 *   // guard.email is the signed-in admin
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<AdminSession | NextResponse> {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const { session, updated, error } = await resolveSession(raw);

  if (!session) {
    // A genuine rejection is a 401 (the caller is logged out). An
    // unreachable GoTrue is NOT a logout — surface a 503 so the client can
    // retry instead of destroying a session that may still be perfectly
    // valid.
    if (error === 'unreachable') return serviceUnavailable();
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  if (updated) {
    cookies().set(SESSION_COOKIE, updated, SESSION_COOKIE_OPTS);
  }

  return session;
}
