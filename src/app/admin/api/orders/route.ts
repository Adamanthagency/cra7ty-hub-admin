import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem, loadOrders } from '@/lib/server/orders-store';

/**
 * GET /admin/api/orders — every order, newest first (Orders, Tracker,
 * Dashboard and Analytics all hydrate from this; the mock seed is only
 * the offline fallback).
 *
 * /admin/api/* skips the middleware guard, so this route runs the real
 * Supabase session check itself via requireAdmin, exactly like
 * /admin/api/products. Orders rows are deny-all RLS — this route is the
 * only way the browser ever sees one, and only a signed-in admin gets
 * past the guard.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 503 });
  }

  try {
    return NextResponse.json({ orders: await loadOrders() });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load orders: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
