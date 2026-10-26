import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /admin/api/auth/magic-link  { email }
 *
 * The gate for the whole admin: an email is normalised (trimmed,
 * lowercased), checked against public.admin_emails with the SERVICE-ROLE
 * key (RLS denies everyone else), and only then does Supabase Auth send
 * a magic link. Not on the list → explicit 403 and NO email is sent —
 * never a silent no-op link.
 *
 * The allowlisted user is ensured to exist first via the admin users
 * API (public signups are disabled project-wide), then /otp with
 * create_user:false delivers the link through Supabase's built-in
 * sender. redirect_to points at the callback page and is validated
 * against the project's URI allow list by GoTrue.
 *
 * Never logs tokens or keys — outcome and status only.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error('[auth] Supabase env vars missing on this server');
    return NextResponse.json({ error: 'Sign-in is not configured.' }, { status: 500 });
  }

  /* 1. allowlist — service-role read of admin_emails (RLS deny-all) */
  const listRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_emails?email=eq.${encodeURIComponent(email)}&select=email`,
    {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      cache: 'no-store',
    },
  ).catch(() => null);

  if (!listRes?.ok) {
    console.error('[auth] allowlist lookup failed', listRes?.status ?? 'network');
    return NextResponse.json({ error: 'Could not verify access.' }, { status: 502 });
  }
  const rows = (await listRes.json().catch(() => [])) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('[auth] magic-link denied — not on allowlist');
    return NextResponse.json(
      { error: 'This email is not on the admin allowlist.' },
      { status: 403 },
    );
  }

  /* 2. ensure the auth user exists (signups are disabled publicly) */
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, email_confirm: true }),
  }).catch(() => null);

  if (createRes && !createRes.ok && createRes.status !== 422) {
    const msg = (await createRes.text().catch(() => '')).slice(0, 200);
    // GoTrue reports duplicates as 422 (or 400 with this message)
    if (!/already been registered|email_exists/i.test(msg)) {
      console.error('[auth] user ensure failed', createRes.status);
      return NextResponse.json({ error: 'Could not prepare sign-in.' }, { status: 502 });
    }
  }

  /* 3. send the magic link — Supabase built-in sender.
     redirect_to MUST travel as a URL QUERY parameter (the same channel
     supabase-js uses: _request appends `?redirect_to=`). GoTrue's
     magic-link mailer reads it via utilities.GetReferrer →
     r.Form.Get("redirect_to") (query string for a JSON POST) or the
     Referer header — NEVER the JSON body, which no /otp param struct
     decodes. Sending it in the body made every emailed link fall back
     to the bare Site URL, dumping tokens at `/` where no page reads
     them (login ended unauthenticated at /admin/login). */
  const redirect_to = `${request.nextUrl.origin}/admin/auth/callback`;
  const otpRes = await fetch(
    `${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect_to)}`,
    {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, create_user: false }),
    },
  ).catch(() => null);

  if (!otpRes) {
    console.error('[auth] otp send network failure');
    return NextResponse.json({ error: 'Could not send the link.' }, { status: 502 });
  }
  if (otpRes.status === 429) {
    return NextResponse.json(
      { error: 'Too many attempts — wait a minute and try again.' },
      { status: 429 },
    );
  }
  if (!otpRes.ok) {
    const detail = (await otpRes.text().catch(() => '')).slice(0, 200);
    console.error('[auth] otp send failed', otpRes.status, detail);
    return NextResponse.json({ error: 'Could not send the link.' }, { status: 502 });
  }

  console.log('[auth] magic link sent');
  return NextResponse.json({ ok: true });
}
