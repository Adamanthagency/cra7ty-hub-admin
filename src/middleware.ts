import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  resolveSession,
} from '@/lib/server/admin-auth';

/**
 * Real session guard (replaces the mock cookie-presence check).
 *
 * Pages: the cookie is verified against GoTrue; one refresh with
 * rotation is allowed, and a rotated token is written BOTH to the
 * outgoing response and into the request headers, so route handlers
 * downstream see the fresh token instead of racing a dead one.
 *
 * /admin/api/* passes through — every handler runs its own real check
 * via requireAdmin() and answers 401 in JSON (a redirect to the login
 * page makes no sense for fetch callers).
 *
 * /admin/login, /admin/auth/* (callback) and the auth API routes are
 * public: they are how you get in.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();

  const isPublic =
    pathname === '/admin/login' ||
    pathname.startsWith('/admin/auth/') ||
    pathname.startsWith('/admin/api/');

  if (isPublic) return NextResponse.next();

  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const { session, updated } = await resolveSession(raw);

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    const res = NextResponse.redirect(url);
    if (raw) res.cookies.delete(SESSION_COOKIE); // clear legacy mock cookies too
    return res;
  }

  if (updated) {
    // rotated during this request: persist it and hand the fresh value
    // to the handlers that will run with this same request
    const headers = new Headers(request.headers);
    const existing = headers.get('cookie') ?? '';
    const cookieHeader = existing.includes(`${SESSION_COOKIE}=`)
      ? existing.replace(
          new RegExp(`${SESSION_COOKIE}=[^;]*`),
          `${SESSION_COOKIE}=${updated}`,
        )
      : `${existing}; ${SESSION_COOKIE}=${updated}`.replace(/^;\s*/, '');
    headers.set('cookie', cookieHeader);
    const res = NextResponse.next({ request: { headers } });
    res.cookies.set(SESSION_COOKIE, updated, SESSION_COOKIE_OPTS);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
