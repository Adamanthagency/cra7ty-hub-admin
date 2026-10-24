import { NextResponse, type NextRequest } from 'next/server';

/**
 * UI-only mock login: sets a session cookie so middleware lets the
 * admin through. Validates that an email and password were typed,
 * nothing more — no user lookup, no credentials check.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const email = form?.get('email');
  const password = form?.get('password');

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('ch_admin_session', 'mock-admin', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
