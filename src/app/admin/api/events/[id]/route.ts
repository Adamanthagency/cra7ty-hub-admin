import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  loadEvent,
  parseEventPayload,
  saveEvent,
  type EventPayload,
} from '@/lib/server/events-store';
import { revalidateStorefront } from '@/lib/server/revalidate';

/**
 * /admin/api/events/[id] — one event.
 * GET   → the event with its counts (edit screen hydration)
 * PATCH → update any editable field, status included (cancel = status
 *         'cancelled'; there is no DELETE — an event with registrations
 *         is history and the FK says so, same philosophy as orders).
 *
 * Status transitions here are NOT race-checked like orders' fulfillment
 * axis: events have one owner (the client) and cancelling is reversible
 * in practice (set back to published). The payment axis is untouched by
 * this route — pending/paid/failed/refunded belongs to the
 * confirmation path only.
 */

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  try {
    const event = await loadEvent(params.id);
    if (!event) return NextResponse.json({ error: 'No such event.' }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load the event: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const existing = await loadEvent(params.id).catch(() => null);
  if (!existing) return NextResponse.json({ error: 'No such event.' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as EventPayload | null;
  const parsed = parseEventPayload(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  // Capacity below the paid count: allowed on purpose (the admin may be
  // closing sales early), but say it out loud so nobody wonders why
  // confirmations are flagging capacity_shortfall afterwards.
  const capacityNote =
    parsed.input.capacity !== null && existing.seatsTaken > parsed.input.capacity
      ? `Capacity is below the ${existing.seatsTaken} seats already confirmed — new payments will be flagged for review, existing tickets stand.`
      : null;

  try {
    const event = await saveEvent({ ...parsed.input, id: params.id });
    const revalidate = await revalidateStorefront({
      paths: ['/workshops', `/workshops/${event.slug}`],
      tags: ['db:events'],
    });
    return NextResponse.json({ ok: true, id: event.id, slug: event.slug, revalidate, capacityNote });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('409') || message.includes('events_slug_key')) {
      return NextResponse.json({ error: 'That slug is already taken.' }, { status: 409 });
    }
    return NextResponse.json({ error: `Save failed: ${message}` }, { status: 502 });
  }
}
