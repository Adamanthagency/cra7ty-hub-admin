import type {
  EventKind,
  EventRegistrationRow,
  EventRow,
  EventStatus,
  EventWaitlistRow,
} from '@/lib/types';
import { configProblem, rest } from '@/lib/server/content-store';

/**
 * Server-side events access for the admin (Tier 6) — same posture as
 * orders-store.ts: SERVICE-ROLE key stays in route env, every route
 * runs requireAdmin + configProblem() first, and the three events
 * tables are deny-all RLS so this module is the only gateway.
 *
 * Seat accounting matches the DB rules exactly (see
 * 20261030000000_events.sql): seats = paid AND NOT needs_review —
 * a flagged refund-in-progress row never eats a seat, and pending
 * rows hold nothing.
 */

const EVENT_COLUMNS =
  'id,slug,name,description,kind,starts_at,ends_at,location,price,capacity,' +
  'image_url,status,position,created_at,updated_at';

const REGISTRATION_COLUMNS =
  'id,registration_number,reference,attendee_name,attendee_email,attendee_phone,' +
  'price_paid,event_name,event_date,event_location,payment_status,needs_review,' +
  'review_reason,payment_date,created_at';

interface EventRowRaw {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  price: number;
  capacity: number | null;
  image_url: string | null;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
  registrations?: { payment_status: string; needs_review: boolean }[];
  event_waitlist?: { id: string }[];
}

function mapEvent(row: EventRowRaw): EventRow {
  const regs = row.registrations ?? [];
  const seatsTaken = regs.filter((r) => r.payment_status === 'paid' && !r.needs_review).length;
  const pendingCount = regs.filter((r) => r.payment_status === 'pending').length;
  const reviewCount = regs.filter((r) => r.needs_review && r.payment_status === 'paid').length;
  const waitlistCount = row.event_waitlist?.length ?? 0;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind === 'exhibition' ? 'exhibition' : 'workshop',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    price: row.price,
    capacity: row.capacity,
    imageUrl: row.image_url,
    status: (row.status as EventStatus) ?? 'draft',
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seatsTaken,
    spotsRemaining:
      row.capacity === null ? null : Math.max(row.capacity - seatsTaken, 0),
    soldOut: row.capacity !== null && seatsTaken >= row.capacity,
    pendingCount,
    reviewCount,
    waitlistCount,
  };
}

/**
 * Every event (all statuses — the screens filter), soonest first, with
 * the seat/waitlist counts the list and detail headers show. The count
 * comes along as embedded rows; one round trip, no N+1.
 */
export async function loadEvents(): Promise<EventRow[]> {
  const rows = await rest<EventRowRaw[]>(
    `events?select=${EVENT_COLUMNS},` +
      `registrations(payment_status,needs_review),` +
      `event_waitlist(id)` +
      `&order=starts_at.asc`,
  );
  return (rows ?? []).map(mapEvent);
}

/** One event by id, or null. */
export async function loadEvent(id: string): Promise<EventRow | null> {
  const rows = await rest<EventRowRaw[]>(
    `events?select=${EVENT_COLUMNS},` +
      `registrations(payment_status,needs_review),` +
      `event_waitlist(id)` +
      `&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows?.[0] ? mapEvent(rows[0]) : null;
}

export interface EventInput {
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

export interface EventPayload {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  kind?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  location?: unknown;
  price?: unknown;
  capacity?: unknown;
  imageUrl?: unknown;
  status?: unknown;
  position?: unknown;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PRICE = 100_000_000; // ₦100m — a typo guard, not a policy

/**
 * Validate an event payload from the admin forms. Returns the parsed
 * input or a user-facing error + HTTP status (create and edit share
 * this, so both screens answer identically).
 */
export function parseEventPayload(
  body: EventPayload | null,
): { input: Omit<EventInput, 'id'> } | { error: string; status: number } {
  if (!body || typeof body !== 'object') {
    return { error: 'Expected a JSON body.', status: 400 };
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!slug || slug.length > 200 || !SLUG_RE.test(slug)) {
    return { error: 'The slug must be lowercase letters, numbers and dashes.', status: 400 };
  }
  if (!name || name.length > 200) {
    return { error: 'The event needs a name (200 characters max).', status: 400 };
  }

  const description = typeof body.description === 'string' ? body.description : '';
  if (description.length > 5000) {
    return { error: 'The description is limited to 5,000 characters.', status: 400 };
  }

  const kind = body.kind === 'exhibition' ? 'exhibition' : 'workshop';
  const status =
    body.status === 'published' || body.status === 'cancelled' ? body.status : 'draft';

  const startsAt = typeof body.startsAt === 'string' ? body.startsAt : '';
  const startDate = new Date(startsAt);
  if (!startsAt || Number.isNaN(startDate.getTime())) {
    return { error: 'The event needs a valid date and time.', status: 400 };
  }

  let endsAt: string | null = null;
  if (typeof body.endsAt === 'string' && body.endsAt.trim()) {
    const endDate = new Date(body.endsAt);
    if (Number.isNaN(endDate.getTime())) {
      return { error: 'The end time is not a valid date.', status: 400 };
    }
    endsAt = endDate.toISOString();
  }

  let location: string | null = null;
  if (typeof body.location === 'string' && body.location.trim()) {
    if (body.location.trim().length > 300) {
      return { error: 'The location is limited to 300 characters.', status: 400 };
    }
    location = body.location.trim();
  }

  const price = body.price === null || body.price === undefined ? 0 : body.price;
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
    return { error: 'The price must be a whole number of naira (0 = free).', status: 400 };
  }

  let capacity: number | null = null;
  if (body.capacity !== null && body.capacity !== undefined && body.capacity !== '') {
    if (
      typeof body.capacity !== 'number' ||
      !Number.isInteger(body.capacity) ||
      body.capacity < 1 ||
      body.capacity > 1_000_000
    ) {
      return {
        error: 'Capacity must be a whole number above 0 — leave it empty for unlimited.',
        status: 400,
      };
    }
    capacity = body.capacity;
  }

  let imageUrl: string | null = null;
  if (typeof body.imageUrl === 'string' && body.imageUrl.trim()) {
    if (!/^https?:\/\//.test(body.imageUrl.trim()) || body.imageUrl.trim().length > 500) {
      return { error: 'The image must be an http(s) URL.', status: 400 };
    }
    imageUrl = body.imageUrl.trim();
  }

  const position =
    typeof body.position === 'number' && Number.isInteger(body.position) ? body.position : 0;

  return {
    input: {
      slug,
      name,
      description,
      kind,
      startsAt: startDate.toISOString(),
      endsAt,
      location,
      price,
      capacity,
      imageUrl,
      status,
      position,
    },
  };
}

/** Create (id absent) or update. Upsert on id — one write, no partial. */
export async function saveEvent(input: EventInput): Promise<EventRow> {
  const payload: Record<string, unknown> = {
    slug: input.slug,
    name: input.name,
    description: input.description,
    kind: input.kind,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    location: input.location,
    price: input.price,
    capacity: input.capacity,
    image_url: input.imageUrl,
    status: input.status,
    updated_at: new Date().toISOString(),
    ...(input.position !== undefined ? { position: input.position } : {}),
  };
  if (input.id) {
    // The id FILTER is load-bearing: rest() takes the whole path, and
    // an unfiltered PATCH would rewrite every event in one stroke.
    const updated = await rest<EventRowRaw[]>(
      `events?id=eq.${encodeURIComponent(input.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      },
    );
    if (!updated || updated.length === 0) throw new Error('no such event');
    return (await loadEvent(input.id)) as EventRow;
  }
  const created = await rest<EventRowRaw[]>('events?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  const id = created?.[0]?.id;
  if (!id) throw new Error('save returned no id');
  return (await loadEvent(id)) as EventRow;
}

/** Registrations for one event, newest first (all payment states). */
export async function loadRegistrations(
  eventId: string,
): Promise<EventRegistrationRow[]> {
  const rows = await rest<
    {
      id: string;
      registration_number: string;
      reference: string;
      attendee_name: string;
      attendee_email: string;
      attendee_phone: string;
      price_paid: number;
      event_name: string;
      event_date: string;
      event_location: string;
      payment_status: string;
      needs_review: boolean;
      review_reason: string | null;
      payment_date: string | null;
      created_at: string;
    }[]
  >(
    `event_registrations?select=${REGISTRATION_COLUMNS}` +
      `&event_id=eq.${encodeURIComponent(eventId)}` +
      `&order=created_at.desc`,
  );
  return (rows ?? []).map((row) => ({
    id: row.id,
    registrationNumber: row.registration_number,
    reference: row.reference,
    attendeeName: row.attendee_name,
    attendeeEmail: row.attendee_email,
    attendeePhone: row.attendee_phone,
    pricePaid: row.price_paid,
    eventName: row.event_name,
    eventDate: row.event_date,
    eventLocation: row.event_location,
    paymentStatus: row.payment_status as EventRegistrationRow['paymentStatus'],
    needsReview: row.needs_review,
    reviewReason: row.review_reason,
    paymentDate: row.payment_date,
    createdAt: row.created_at,
  }));
}

/** Waitlist entries for one event, oldest first (queue order). */
export async function loadWaitlist(eventId: string): Promise<EventWaitlistRow[]> {
  const rows = await rest<
    { id: string; name: string; email: string; phone: string; status: string; created_at: string }[]
  >(
    `event_waitlist?select=id,name,email,phone,status,created_at` +
      `&event_id=eq.${encodeURIComponent(eventId)}` +
      `&order=created_at.asc`,
  );
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status === 'notified' ? 'notified' : 'waiting',
    createdAt: row.created_at,
  }));
}

/**
 * Flip a waitlist entry to 'notified'. The promo EMAIL is sent by the
 * storefront route (it owns RESEND_API_KEY; this server does not) —
 * callers send the email FIRST and only call this on success, so
 * 'notified' always means "actually written to".
 */
export async function markWaitlistNotified(id: string): Promise<boolean> {
  const rows = await rest<unknown[]>(
    `event_waitlist?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'notified' }),
    },
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Ask the storefront to email a waitlist entry that a spot opened.
 * Same shared-secret pattern as revalidateStorefront (the storefront
 * verifies Bearer REVALIDATE_SECRET); returns true only on a 2xx.
 */
export async function sendSpotOpenedEmail(input: {
  email: string;
  eventName: string;
  eventUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const base = process.env.STOREFRONT_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!base) return { ok: false, error: 'STOREFRONT_URL is not set on this server' };
  if (!secret) return { ok: false, error: 'REVALIDATE_SECRET is not set on this server' };
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/api/events/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      return { ok: false, error: `storefront answered HTTP ${response.status}${detail ? `: ${detail}` : ''}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export { configProblem, rest };
