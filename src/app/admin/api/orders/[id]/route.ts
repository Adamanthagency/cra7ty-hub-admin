import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  applyOrderStatus,
  configProblem,
  loadOrder,
  OrderTransitionError,
  saveOrderNotes,
} from '@/lib/server/orders-store';
import type { OrderStatus } from '@/lib/types';

/**
 * One order by display number ("CH-01043").
 *
 * GET   → the order with its items
 * PATCH → { status } and/or { notes }
 *
 * Status changes go through the apply_order_status RPC (forward-only in
 * the database): this handler maps its failures to honest HTTP codes —
 * 404 unknown order, 409 for an illegal jump (e.g. pending → delivered)
 * with the allowed next steps, 400 for a malformed status.
 *
 * The PAYMENT axis is read-only here on purpose: nothing an admin does
 * can mark an order paid — that only happens through Paystack's
 * webhook/verify confirmation path.
 */
export const dynamic = 'force-dynamic';

const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'in_transit', 'delivered', 'cancelled'];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  try {
    const order = await loadOrder(params.id);
    if (!order) {
      return NextResponse.json({ error: 'No such order.' }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load the order: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    notes?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const hasStatus = body.status !== undefined;
  const hasNotes = body.notes !== undefined;
  if (!hasStatus && !hasNotes) {
    return NextResponse.json(
      { error: 'Nothing to update — provide status and/or notes.' },
      { status: 400 },
    );
  }
  if (hasStatus && (typeof body.status !== 'string' || !STATUSES.includes(body.status as OrderStatus))) {
    return NextResponse.json(
      { error: `Status must be one of: ${STATUSES.join(', ')}.` },
      { status: 400 },
    );
  }
  if (hasNotes && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
    return NextResponse.json(
      { error: 'Notes must be a string of at most 2000 characters.' },
      { status: 400 },
    );
  }

  try {
    if (hasStatus) {
      await applyOrderStatus(params.id, body.status as OrderStatus);
    }
    if (hasNotes) {
      await saveOrderNotes(params.id, body.notes as string);
    }
    const order = await loadOrder(params.id);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderTransitionError) {
      if (error.message === 'not_found') {
        return NextResponse.json({ error: 'No such order.' }, { status: 404 });
      }
      if (error.message === 'invalid_transition') {
        return NextResponse.json(
          {
            error:
              'That jump is not allowed — orders move forward only (pending → confirmed → in transit → delivered), and any undelivered order can be cancelled.',
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Could not update the order: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
