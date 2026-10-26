import type { Order, OrderStatus, PromoCode } from '@/lib/types';

/**
 * The admin's wire to the Orders/Promo/Analytics API routes — the sibling
 * of catalog-api.ts. The browser talks only to /admin/api/*, never to
 * Supabase: orders and coupon codes are deny-all RLS and the service-role
 * key stays in the route's server env. Screens hydrate from these calls;
 * the mock seeds remain only as instant paint and the offline fallback.
 *
 * Status changes are validated by the DATABASE (forward-only through
 * apply_order_status) — a 409 here means the jump was illegal, and the
 * message says so.
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
  return `unexpected response (${status})`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

async function sendJson<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

/* ---------------------------- orders ---------------------------- */

export async function fetchOrders(): Promise<Order[]> {
  const data = await getJson<{ orders: Order[] }>('/admin/api/orders');
  return data.orders;
}

export async function fetchOrder(id: string): Promise<Order> {
  const data = await getJson<{ order: Order }>(`/admin/api/orders/${encodeURIComponent(id)}`);
  return data.order;
}

/** Advance fulfillment status (server validates the transition). */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const data = await sendJson<{ order: Order }>('PATCH', `/admin/api/orders/${encodeURIComponent(id)}`, { status });
  return data.order;
}

export async function saveOrderNotes(id: string, notes: string): Promise<Order> {
  const data = await sendJson<{ order: Order }>('PATCH', `/admin/api/orders/${encodeURIComponent(id)}`, { notes });
  return data.order;
}

/* --------------------------- promo codes --------------------------- */

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  const data = await getJson<{ promoCodes: PromoCode[] }>('/admin/api/promo-codes');
  return data.promoCodes;
}

export async function savePromoCode(promo: PromoCode): Promise<PromoCode> {
  const data = await sendJson<{ promo: PromoCode }>('POST', '/admin/api/promo-codes', promo);
  return data.promo;
}

export async function deletePromoCode(id: string): Promise<void> {
  await sendJson<{ deleted: boolean }>('DELETE', `/admin/api/promo-codes?id=${encodeURIComponent(id)}`);
}

/* ---------------------------- analytics ---------------------------- */

export interface AnalyticsSummary {
  totals: {
    orders: number;
    paidOrders: number;
    revenue: number;
    needsReview: number;
    deliveredToday: number;
  };
  days: { day: string; revenue: number; orders: number }[];
  byStatus: Record<string, number>;
  topProducts: { name: string; units: number; revenue: number }[];
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  return getJson<AnalyticsSummary>('/admin/api/analytics');
}
