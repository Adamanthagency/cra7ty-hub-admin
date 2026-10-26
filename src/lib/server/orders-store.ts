import type { Order, OrderItem, OrderStatus, PromoCode } from '@/lib/types';
import { configProblem, rest } from '@/lib/server/content-store';

/**
 * Server-only Supabase access for the Orders/Tracker/Dashboard/Analytics
 * screens and the promo-codes manager (Tier 4: Paystack checkout).
 * Same posture as catalog-store.ts: the SERVICE-ROLE key lives here, is
 * never sent to the browser, and every route calls requireAdmin +
 * configProblem() before these functions.
 *
 * orders/order_items/coupon_codes are deny-all RLS (the Tier 4
 * migration): anon and authenticated cannot read or write them at all —
 * this module (inside admin routes) is the only gateway.
 *
 * ID NOTE: the admin's Order.id is the human display number
 * ("CH-01043", orders.order_number) because that is what the screens
 * show and what the detail URL carries. The uuid is resolved server-side
 * when a write needs it (apply_order_status takes a uuid).
 *
 * Status NOTE: fulfillment status (pending → confirmed → in_transit →
 * delivered, any non-delivered → cancelled) is advanced ONLY through the
 * apply_order_status RPC — forward-only and race-safe in the database.
 * The payment axis (pending/paid/failed/refunded) is written by the
 * checkout confirmation path, never by these functions.
 */

const ORDER_SELECT =
  'id,order_number,reference,customer_name,customer_email,customer_phone,delivery_address,subtotal,discount,delivery_fee,total,coupon_code,payment_status,status,needs_review,review_reason,payment_date,notes,created_at,updated_at,order_items(id,product_name,variant_label,quantity,unit_price,line_total,position)';

interface OrderItemRow {
  product_name: string;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  position: number;
}

interface OrderRow {
  id: string;
  order_number: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  coupon_code: string | null;
  payment_status: string;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[];
}

function mapOrder(row: OrderRow): Order {
  const items: OrderItem[] = [...(row.order_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      productName: item.product_name,
      ...(item.variant_label ? { variant: item.variant_label } : {}),
      quantity: item.quantity,
      unitPrice: item.unit_price,
    }));

  return {
    id: row.order_number,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address,
    items,
    deliveryFee: row.delivery_fee,
    ...(row.coupon_code ? { promoCode: row.coupon_code } : {}),
    // keep 0 out of the optional field so "no discount" renders clean
    ...(row.discount ? { discount: row.discount } : {}),
    status: row.status as OrderStatus,
    paymentRef: row.reference,
    paymentStatus: row.payment_status as Order['paymentStatus'],
    paymentDate: row.payment_date ?? '',
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerEmail: row.customer_email,
    needsReview: row.needs_review,
    reviewReason: row.review_reason,
  };
}

/** Every order, newest first, with items. */
export async function loadOrders(): Promise<Order[]> {
  const rows = await rest<OrderRow[]>(
    `orders?select=${ORDER_SELECT}&order=created_at.desc`,
  );
  return (rows ?? []).map(mapOrder);
}

/** One order by its display number, or null. */
export async function loadOrder(orderNumber: string): Promise<Order | null> {
  const rows = await rest<OrderRow[]>(
    `orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=${ORDER_SELECT}&limit=1`,
  );
  return rows?.[0] ? mapOrder(rows[0]) : null;
}

/** Thrown by applyOrderStatus so the route can pick the HTTP code. */
export class OrderTransitionError extends Error {}

/**
 * Advance the fulfillment status through the DB's forward-only
 * apply_order_status RPC. The RPC raises:
 *   order_not_found:<id>        → OrderTransitionError('not_found')
 *   invalid_status:<next>       → OrderTransitionError('invalid')
 *   invalid_transition:<a>-><b> → OrderTransitionError('invalid_transition')
 */
export async function applyOrderStatus(
  orderNumber: string,
  next: OrderStatus,
): Promise<{ status: OrderStatus }> {
  // The RPC keys on the uuid; the admin only ever holds the display id.
  const rows = await rest<{ id: string }[]>(
    `orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=id&limit=1`,
  );
  const uuid = rows?.[0]?.id;
  if (!uuid) throw new OrderTransitionError('not_found');

  try {
    await rest('rpc/apply_order_status', {
      method: 'POST',
      body: JSON.stringify({ p_order_id: uuid, p_next: next }),
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('order_not_found')) throw new OrderTransitionError('not_found');
    if (message.includes('invalid_transition')) {
      throw new OrderTransitionError('invalid_transition');
    }
    if (message.includes('invalid_status')) throw new OrderTransitionError('invalid');
    throw error;
  }
  return { status: next };
}

/** Free-text studio notes on one order (contact attempts, context). */
export async function saveOrderNotes(
  orderNumber: string,
  notes: string,
): Promise<void> {
  await rest(
    `orders?order_number=eq.${encodeURIComponent(orderNumber)}`,
    { method: 'PATCH', body: JSON.stringify({ notes: notes || null }) },
  );
}

/* ------------------------------------------------------------------ */
/* Promo codes (coupon_codes)                                          */
/* ------------------------------------------------------------------ */

interface CouponRow {
  id: string;
  code: string;
  type: string;
  value: number;
  usage_count: number;
  usage_limit: number | null;
  expires_at: string | null;
  min_order_amount: number | null;
  active: boolean;
}

function mapCoupon(row: CouponRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    type: row.type as PromoCode['type'],
    value: row.value,
    usageCount: row.usage_count,
    ...(row.usage_limit != null ? { usageLimit: row.usage_limit } : {}),
    // the admin renders an ISO date; a null expiry means "never"
    expiresAt: row.expires_at ? row.expires_at.slice(0, 10) : '',
    ...(row.min_order_amount != null
      ? { minOrderAmount: row.min_order_amount }
      : {}),
    active: row.active,
  };
}

export async function loadPromoCodes(): Promise<PromoCode[]> {
  const rows = await rest<CouponRow[]>(
    'coupon_codes?select=*&order=created_at.desc',
  );
  return (rows ?? []).map(mapCoupon);
}

/**
 * Save one promo code. usage_count is NEVER client-writable — the
 * payment confirmation path owns it — so an EDIT is a PATCH of the
 * mutable columns only (an upsert would reset the counter to its
 * default), and a NEW code is a plain INSERT (default 0).
 */
export async function savePromoCode(promo: PromoCode): Promise<void> {
  const row = {
    code: promo.code,
    type: promo.type,
    value: promo.value,
    usage_limit: promo.usageLimit ?? null,
    expires_at: promo.expiresAt ? promo.expiresAt : null,
    min_order_amount: promo.minOrderAmount ?? null,
    active: promo.active,
  };
  const existing = await rest<{ id: string }[]>(
    `coupon_codes?id=eq.${encodeURIComponent(promo.id)}&select=id&limit=1`,
  );
  if (existing?.length) {
    await rest(`coupon_codes?id=eq.${encodeURIComponent(promo.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(row),
    });
  } else {
    await rest('coupon_codes', {
      method: 'POST',
      body: JSON.stringify([{ id: promo.id, ...row }]),
    });
  }
}

export async function deletePromoCode(id: string): Promise<boolean> {
  try {
    await rest(`coupon_codes?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}

export { configProblem };
