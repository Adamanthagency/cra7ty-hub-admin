'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

/**
 * Magic-link landing page. Supabase's verify endpoint redirects here
 * with the tokens in the URL FRAGMENT (#access_token=…), which never
 * reaches the server — so this client page reads them, hands them to
 * /admin/api/auth/session for verification, and only then lands in the
 * admin. Failure modes (expired link, bad redirect) arrive as ?error=
 * query params from GoTrue and get a plain message plus a way back.
 */
export default function AdminAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function complete() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const search = new URLSearchParams(window.location.search);

      const access_token = hash.get('access_token');
      const refresh_token = hash.get('refresh_token');
      const expires_in = Number(hash.get('expires_in') ?? '3600');

      if (access_token && refresh_token) {
        try {
          const res = await fetch('/admin/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ access_token, refresh_token, expires_in }),
          });
          if (res.ok) {
            router.replace('/admin/dashboard');
            router.refresh();
            return;
          }
          setError('That link is no longer valid. Request a new one.');
          return;
        } catch {
          setError('Could not finish signing in. Try again.');
          return;
        }
      }

      // GoTrue failure redirects: ?error=…&error_code=… (also seen in hash)
      const errCode =
        search.get('error_code') ?? hash.get('error_code') ?? '';
      const errDesc =
        search.get('error_description') ?? hash.get('error_description') ?? '';
      if (errCode || errDesc) {
        setError(
          errCode === 'otp_expired' || /expired/i.test(errDesc)
            ? 'That link has expired. Request a new one.'
            : 'Sign-in failed. Request a new link.',
        );
        return;
      }

      setError('This page was opened directly. Start at the sign-in page.');
    }

    void complete();
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-baseline gap-2">
            <span className="font-display text-2xl tracking-tight text-paper">
              Cra7ty Hub
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-kraft-60">
              admin
            </span>
          </div>
          <p role="alert" className="mb-6 font-mono text-xs text-vermilion">
            {error}
          </p>
          <Link
            href="/admin/login"
            className="btn-vermilion inline-flex w-full justify-center"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <Loader2 size={18} className="animate-spin text-vermilion" aria-hidden />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
          Signing you in…
        </p>
      </div>
    </div>
  );
}
