import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  markWaitlistNotified,
  rest,
  sendSpotOpenedEmail,
} from '@/lib/server/events-store';

/**
 * PATCH /admin/api/events/waitlist/[id] — the waitlist's only write.
 * Body { action: 'notify' }: email the person that a spot opened (via
 * the storefront route, which owns the Resend key), then flip the row
 * to 'notified'.
 *
 * ORDER IS THE CONTRACT: email FIRST, status SECOND. If the send fails
 * the row stays 'waiting' and the button stays pressable — 'notified'
 * must never mean "we tried". Repeat notifies are allowed (the admin
 * decides if a second nudge is right; this route does not judge).
 */

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (!body || body.action !== 'notify') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  // The entry, with its event (the email carries the event's name and
  // page link — the person must land on the page that still sells the
  // released seat, first-come).
  interface EntryRow {
    id: string;
    email: string;
    name: string;
    status: string;
    events: { slug: string; name: string; status: string } | null;
  }
  let entry: EntryRow | null = null;
  try {
    const rows = await rest<EntryRow[]>(
      `event_waitlist?select=id,email,name,status,events(slug,name,status)` +
        `&id=eq.${encodeURIComponent(params.id)}&limit=1`,
    );
    entry = rows?.[0] ?? null;
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load the waitlist entry: ${(error as Error).message}` },
      { status: 500 },
    );
  }

  if (!entry || !entry.events) {
    return NextResponse.json({ error: 'No such waitlist entry.' }, { status: 404 });
  }

  const sent = await sendSpotOpenedEmail({
    email: entry.email,
    eventName: entry.events.name,
    eventUrl: `/workshops/${entry.events.slug}`,
  });
  if (!sent.ok) {
    console.error('[admin-events] spot-opened email failed:', sent.error);
    return NextResponse.json(
      {
        error: 'The email could not be sent — the entry stays on the list, try again.',
        detail: sent.error,
      },
      { status: 502 },
    );
  }

  const updated = await markWaitlistNotified(entry.id).catch(() => false);
  if (!updated) {
    // The person WAS emailed — say so even though the flag write
    // failed; the admin can press Notify again safely (the email is
    // identical).
    return NextResponse.json({ ok: true, flagged: false });
  }
  return NextResponse.json({ ok: true, flagged: true });
}
