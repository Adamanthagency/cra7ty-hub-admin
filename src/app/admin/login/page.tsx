'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/admin/api/mock-login', {
        method: 'POST',
        body: new URLSearchParams({ email, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not sign in.');
        return;
      }
      router.replace('/admin/dashboard');
      router.refresh();
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

        <h1 className="mb-1 text-lg font-medium text-paper">Sign in</h1>
        <p className="mb-6 text-sm text-paper-60">
          Workshop access for the studio team.
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
              placeholder="admin@cra7tyhub.ng"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-hairline"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="font-mono text-xs text-vermilion">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-vermilion w-full">
            {submitting && <Loader2 size={14} className="animate-spin" aria-hidden />}
            Sign in
          </button>
        </form>

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
          Mock auth — any email and password will do
        </p>
      </div>
    </div>
  );
}
