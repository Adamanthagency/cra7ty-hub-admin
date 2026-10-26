/**
 * Server-only caller for the storefront's on-demand revalidation
 * endpoint (instant-publish stage). One rule: the admin's write
 * succeeded FIRST, then it asks the storefront to refresh — so a failed
 * refresh never blocks or undoes a save, it is reported and the
 * storefront's kept 300s timer bounds the staleness.
 *
 * Both values live in this server's env and never reach the browser:
 *   STOREFRONT_URL   exact origin of the deployed storefront
 *   REVALIDATE_SECRET  shared bearer token the storefront verifies
 * The secret is never logged, never put in a URL, never in a NEXT_PUBLIC_
 * variable — the fetch below is the only place it is used.
 */

/** One revalidation call is a courtesy, not a dependency: short budget. */
const TIMEOUT_MS = 5000;

// The wire type is shared with the API client (type-only import —
// erased at build time, no client code pulls this server module in).
export type { RevalidateStatus } from '@/lib/publish-api';
import type { RevalidateStatus } from '@/lib/publish-api';

export interface RevalidateInput {
  paths?: string[];
  tags?: string[];
}

/**
 * Ask the storefront to revalidate the given paths and tags. Never
 * throws — the result always says whether the live site was refreshed
 * and how long it took, so routes can attach it to an otherwise
 * successful response.
 */
export async function revalidateStorefront(
  input: RevalidateInput,
): Promise<RevalidateStatus> {
  const base = process.env.STOREFRONT_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!base) {
    return { ok: false, ms: 0, error: 'STOREFRONT_URL is not set on this server' };
  }
  if (!secret) {
    return { ok: false, ms: 0, error: 'REVALIDATE_SECRET is not set on this server' };
  }

  const started = Date.now();
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      return {
        ok: false,
        ms,
        error: `storefront answered HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      };
    }
    return { ok: true, ms };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: (error as Error).message };
  }
}
