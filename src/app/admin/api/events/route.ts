import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  loadEvents,
  parseEventPayload,
  saveEvent,
  type EventPayload,
} from '@/lib/server/events-store';
import { revalidateStorefront } from '@/lib/server/revalidate';

/**
 * /admin/api/events — the events manager's API (Tier 6), following the
 * products/orders route contract: requireAdmin + configProblem at the
 * door, service-role access only inside events-store.
 *
 * GET  → every event with seat/pending/review/waitlist counts
 * POST → create one event (validated shape; slug unique — 409 on clash)
 *
 * Saves land in the database first, then the storefront is asked to
 * refresh /workshops and the event page on demand (same instant-publish
 * contract as products; the 300s ISR timer is the safety net).
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  try {
    return NextResponse.json({ events: await loadEvents() });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load events: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const body = (await request.json().catch(() => null)) as EventPayload | null;
  const parsed = parseEventPayload(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const event = await saveEvent(parsed.input);
    const revalidate = await revalidateStorefront({
      paths: ['/workshops', `/workshops/${event.slug}`],
      tags: ['db:events'],
    });
    return NextResponse.json({ ok: true, id: event.id, slug: event.slug, revalidate });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('409') || message.includes('events_slug_key')) {
      return NextResponse.json({ error: 'That slug is already taken.' }, { status: 409 });
    }
    return NextResponse.json({ error: `Save failed: ${message}` }, { status: 502 });
  }
}
