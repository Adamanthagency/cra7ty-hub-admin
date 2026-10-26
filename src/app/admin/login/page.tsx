'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, MailCheck } from 'lucide-react';

/**
 * Passwordless sign-in: one email field, one button. The server decides
 * whether the address is on the allowlist — a rejection is shown
 * verbatim, and no link is sent to anyone outside the list. Success is
 * a "check your inbox" state (the link lands at the callback page).
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/admin/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not send the link.');
        return;
      }
      setSent(true);
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-baseline gap-2">
          <span className="font-display text-2xl tracking-tight text-paper">Cra7ty Hub</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-kraft-60">
            admin
          </span>
        </div>

        {sent ? (
          <>
            <h1 className="mb-1 flex items-center gap-2 text-lg font-medium text-paper">
              <MailCheck size={18} className="text-vermilion" aria-hidden />
              Check your email
            </h1>
            <p className="mb-4 text-sm text-paper-60">
              If <span className="text-paper">{email}</span> is on the admin
              list, a sign-in link is on its way. It expires in one hour and
              can be used once.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setError(null);
              }}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40 underline-offset-4 hover:text-paper-70 hover:underline"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-medium text-paper">Sign in</h1>
            <p className="mb-6 text-sm text-paper-60">
              We&apos;ll email you a sign-in link. Workshop access for the
              studio team.
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-hairline"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <p role="alert" className="font-mono text-xs text-vermilion">
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting} className="btn-vermilion w-full">
                {submitting && <Loader2 size={14} className="animate-spin" aria-hidden />}
                Send sign-in link
              </button>
            </form>
          </>
        )}

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
          Access is limited to allowlisted addresses
        </p>
      </div>
    </div>
  );
}
