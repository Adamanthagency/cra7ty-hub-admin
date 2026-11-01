import type { EventPost } from '@/lib/types';

/**
 * The admin browser's wire to /admin/api/event-posts — the sibling of
 * catalog-api.ts for the Events announcement feed. Client talks only to
 * the admin API route, never to Supabase: the service-role key lives in
 * the route's server env.
 *
 * No seed fallback: event posts have no mock era (an invented
 * announcement would be a lie). The list starts empty and says so,
 * then hydrates from the API — the same posture as the events manager.
 *
 * Every save is a single-row upsert that lands in the database
 * immediately; the route then asks the storefront to revalidate
 * /events on demand, so the change is live within seconds. The
 * storefront's kept 300s timer is only the safety net for a failed
 * refresh call, which the responses report as `revalidate`.
 */

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function explain(status: number): string {
  if (status === 401) return 'your session expired — sign in again';
  if (status === 503)
    return 'Supabase is not configured on this server (the response names the missing variable)';
  if (status === 502) return 'Supabase rejected the request';
  return `unexpected response (${status})`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

export async function fetchEventPosts(): Promise<EventPost[]> {
  const body = await getJson<{ eventPosts: EventPost[] }>('/admin/api/event-posts');
  return body.eventPosts;
}

export async function saveEventPost(
  post: EventPost,
): Promise<{ ok: true; id: string; revalidate?: { ok: boolean; error?: string; ms?: number } }> {
  return postJson('/admin/api/event-posts', post);
}

export async function deleteEventPost(
  id: string,
): Promise<{ revalidate?: { ok: boolean; error?: string } }> {
  const response = await fetch(`/admin/api/event-posts?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as { revalidate?: { ok: boolean; error?: string } };
}
