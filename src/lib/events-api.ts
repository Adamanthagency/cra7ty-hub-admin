import type { EventKind, EventRegistrationRow, EventRow, EventStatus, EventWaitlistRow } from '@/lib/types';

/**
 * The admin browser's wire to /admin/api/events* — the sibling of
 * catalog-api.ts. Client talks only to the admin API routes, never to
 * Supabase: the service-role key lives in the routes' server env.
 *
 * No seed fallback: events have no mock era (an admin list showing
 * invented events would be a lie). Empty states are rendered from an
 * empty array instead.
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
  if (status === 409) return 'that slug is already taken (or the event changed)';
  if (status === 503) return 'Supabase is not configured on this server';
  if (status === 502) return 'Supabase or the storefront rejected the request';
  return `unexpected response (${status})`;
}

export class EventApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new EventApiError(response.status, `${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

async function sendJson<T>(method: 'POST' | 'PATCH', path: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) throw new EventApiError(response.status, `${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

export interface EventSaveInput {
  id?: string;
  slug: string;
  name: string;
  description: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  price: number;
  capacity: number | null;
  imageUrl: string | null;
  status: EventStatus;
  position?: number;
}

export interface EventSaveResult {
  ok: boolean;
  id: string;
  slug: string;
  revalidate?: { ok: boolean; error?: string };
  /** present when capacity was set below already-confirmed seats */
  capacityNote?: string | null;
}

export interface EventDetail {
  event: EventRow;
}

export interface EventRegistrations {
  registrations: EventRegistrationRow[];
  waitlist: EventWaitlistRow[];
}

export const fetchEvents = () => getJson<{ events: EventRow[] }>('/admin/api/events');

export const fetchEvent = (id: string) =>
  getJson<EventDetail>(`/admin/api/events/${encodeURIComponent(id)}`);

export const fetchEventRegistrations = (id: string) =>
  getJson<EventRegistrations>(`/admin/api/events/${encodeURIComponent(id)}/registrations`);

export const createEvent = (input: EventSaveInput) =>
  sendJson<EventSaveResult>('POST', '/admin/api/events', input);

export const updateEvent = (id: string, input: EventSaveInput) =>
  sendJson<EventSaveResult>('PATCH', `/admin/api/events/${encodeURIComponent(id)}`, input);

export const notifyWaitlist = (entryId: string) =>
  sendJson<{ ok: boolean; flagged?: boolean }>(
    'PATCH',
    `/admin/api/events/waitlist/${encodeURIComponent(entryId)}`,
    { action: 'notify' },
  );
