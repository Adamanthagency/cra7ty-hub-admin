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
 * via requireAdmin() and answers 401 (not signed in) or 503 (auth
 * service unreachable — session kept) in JSON; a redirect to the login
 * page makes no sense for fetch callers.
 *
 * A genuine rejection (401/invalid token) logs the caller out as before.
 * An unreachable GoTrue is NOT a logout: pages get a lightweight 503
 * "can't verify session" page and the cookie is left intact.
 *
 * /admin/login, /admin/auth/* (callback) and the auth API routes are
 * public: they are how you get in.
 */
/**
 * Served when GoTrue is unreachable: a transient auth outage must not log
 * the admin out or redirect them to login. The session cookie is left
 * intact so the next request can succeed once GoTrue recovers. Minimal,
 * self-contained, no external assets — it must render even when nothing
 * else is reachable.
 */
const UNREACHABLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cra7ty Hub Admin — can't verify session</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f4efe6; color: #1c1917;
    font: 15px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
  main { max-width: 34rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.15rem; margin: 0 0 0.75rem; letter-spacing: 0.02em; }
  p { margin: 0 0 1.25rem; color: #57534e; }
  button { font: inherit; border: 1px solid #1c1917; background: transparent;
    color: #1c1917; padding: 0.5rem 1rem; cursor: pointer; }
  button:hover { background: #1c1917; color: #f4efe6; }
</style>
</head>
<body>
<main>
  <h1>Can't verify your session</h1>
  <p>The admin can't reach the authentication service right now. Your session has <strong>not</strong> been cleared — please retry in a moment.</p>
  <button onclick="location.reload()">Retry</button>
</main>
</body>
</html>`;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();

  const isPublic =
    pathname === '/admin/login' ||
    pathname.startsWith('/admin/auth/') ||
    pathname.startsWith('/admin/api/');

  if (isPublic) return NextResponse.next();

  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const { session, updated, error } = await resolveSession(raw);

  if (!session) {
    // GoTrue unreachable: do NOT destroy the cookie and do NOT redirect to
    // login — a transient auth outage must not log the admin out. Serve a
    // lightweight "can't verify session" page; the cookie survives so the
    // next request can succeed once GoTrue recovers.
    if (error === 'unreachable') {
      return new NextResponse(UNREACHABLE_HTML, {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

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
