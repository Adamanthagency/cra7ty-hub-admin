import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, decodeSession } from '@/lib/server/admin-auth';

/**
 * POST /admin/api/auth/logout — invalidates the access token at GoTrue
 * (best-effort; a dead token is already signed out) and clears the
 * cookie either way.
 */
export async function POST(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (raw) {
    try {
      const session = decodeSession(raw);
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      }).catch(() => null);
    } catch {
      /* malformed/legacy cookie — nothing to invalidate */
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  console.log('[auth] signed out');
  return res;
}
