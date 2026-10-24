import { NextResponse, type NextRequest } from 'next/server';

/**
 * Mock session guard: cookie presence only, no crypto, no real auth.
 * The cookie is set by the mock login route.
 */
export function middleware(request: NextRequest) {
  const session = request.cookies.get('ch_admin_session');
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === '/admin/login' || pathname.startsWith('/admin/api/');

  if (pathname.startsWith('/admin') && !isPublic && !session) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
