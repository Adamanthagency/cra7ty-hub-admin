import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem, loadOrders } from '@/lib/server/orders-store';

/**
 * GET /admin/api/analytics — aggregates for the Analytics screen and the
 * Dashboard tiles, computed from the real orders table (a studio's
 * dataset is small enough to aggregate in the handler — no aggregate
 * RPC needed).
 *
 * Revenue counts PAID orders only (money actually landed). "Delivered
 * today" keys off updated_at so a status flip shows immediately.
 */
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  try {
    const orders = await loadOrders();
    const now = new Date();

    const paid = orders.filter((o) => o.paymentStatus === 'paid');
    const revenue = paid.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) - (o.discount ?? 0) + o.deliveryFee,
      0,
    );

    // last 14 days: revenue per day (paid orders, by payment date)
    const days: { day: string; revenue: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * DAY_MS);
      days.push({ day: d.toISOString().slice(5, 10), revenue: 0, orders: 0 });
    }
    for (const order of paid) {
      if (!order.paymentDate) continue;
      const key = order.paymentDate.slice(5, 10);
      const bucket = days.find((d) => d.day === key);
      if (bucket) {
        bucket.revenue += order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) - (order.discount ?? 0) + order.deliveryFee;
        bucket.orders += 1;
      }
    }

    const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});

    const topProducts = new Map<string, { units: number; revenue: number }>();
    for (const order of paid) {
      for (const item of order.items) {
        const entry = topProducts.get(item.productName) ?? { units: 0, revenue: 0 };
        entry.units += item.quantity;
        entry.revenue += item.quantity * item.unitPrice;
        topProducts.set(item.productName, entry);
      }
    }

    const today = now.toISOString().slice(0, 10);
    const deliveredToday = orders.filter(
      (o) => o.status === 'delivered' && o.updatedAt.slice(0, 10) === today,
    ).length;

    return NextResponse.json({
      totals: {
        orders: orders.length,
        paidOrders: paid.length,
        revenue,
        needsReview: orders.filter((o) => o.needsReview).length,
        deliveredToday,
      },
      days,
      byStatus,
      topProducts: Array.from(topProducts.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 8),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not compute analytics: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
