'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { StatusChip } from '@/components/admin/status-chip';
import { StatusTimeline, forwardStatuses } from '@/components/admin/status-timeline';
import { orders as seedOrders, orderSubtotal } from '@/data/mock/orders';
import { fetchOrder, setOrderStatus, saveOrderNotes } from '@/lib/orders-api';
import type { Order, OrderStatus } from '@/lib/types';
import { formatNgn, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();

  // Instant paint from the seed when the id matches one, then hydrate
  // from the real orders table — the DB is the source of truth.
  const [order, setOrder] = useState<Order | undefined>(
    () => seedOrders.find((o) => o.id === params.id)
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | ''>('');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetchOrder(params.id)
      .then((data) => {
        if (!live) return;
        setOrder(data);
        setNotes(data.notes ?? '');
      })
      .catch((error) => {
        if (!live) return;
        const message = (error as Error).message;
        if (message.includes('404') || message.includes('No such order')) {
          setNotFound(true);
        } else {
          // keep whatever the seed painted; say why hydration stopped
          setFlash({ kind: 'error', text: message });
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">Loading order…</p>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">
          No order with id “{params.id}”.
        </p>
        <Link href="/admin/orders" className="btn-ghost-dark mt-4">
          Back to orders
        </Link>
      </div>
    );
  }

  const subtotal = orderSubtotal(order);
  const options = forwardStatuses(order.status);

  // Status changes go through the API → apply_order_status RPC: the
  // DATABASE enforces forward-only, so a rejected jump surfaces as an
  // honest error instead of optimistic local state.
  const applyStatus = async () => {
    if (!pendingStatus || !order) return;
    setFlash(null);
    try {
      const updated = await setOrderStatus(order.id, pendingStatus);
      setOrder(updated);
      setPendingStatus('');
      setFlash({ kind: 'ok', text: 'Status updated.' });
    } catch (error) {
      setFlash({ kind: 'error', text: (error as Error).message });
    }
  };

  const saveNotes = async () => {
    if (!order || savingNotes) return;
    setSavingNotes(true);
    setFlash(null);
    try {
      const updated = await saveOrderNotes(order.id, notes);
      setOrder(updated);
      setFlash({ kind: 'ok', text: 'Notes saved.' });
    } catch (error) {
      setFlash({ kind: 'error', text: (error as Error).message });
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div>
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden />
        All orders
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl tracking-tight text-paper">
          Order {order.id}
        </h1>
        <StatusChip status={order.status} />
        {order.needsReview && (
          <span
            title={
              order.reviewReason
                ? `Flagged: ${order.reviewReason.replaceAll('_', ' ')}`
                : 'Flagged for manual review'
            }
            className="inline-flex items-center gap-1.5 rounded-card border border-vermilion px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-vermilion"
          >
            ● needs review
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: order details */}
        <section className="card-admin overflow-hidden lg:col-span-2">
          <h2 className="border-b border-line px-4 py-3 text-sm font-medium text-paper">
            Order details
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                  <th scope="col" className="px-4 py-2.5 font-normal">Item</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">Qty</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">Unit</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="px-4 py-3">
                      <span className="block text-paper">{item.productName}</span>
                      {item.variant && (
                        <span className="font-mono text-[11px] text-paper-60">
                          {item.variant}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper-70">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper-70">
                      {formatNgn(item.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper">
                      {formatNgn(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-mono text-xs">
                <tr className="border-b border-line/60">
                  <td colSpan={3} className="px-4 py-2.5 text-right text-paper-60">
                    Subtotal
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-paper-70">
                    {formatNgn(subtotal)}
                  </td>
                </tr>
                {order.discount !== undefined && order.discount > 0 && (
                  <tr className="border-b border-line/60">
                    <td colSpan={3} className="px-4 py-2.5 text-right text-paper-60">
                      Discount{' '}
                      <span className="text-vermilion">[{order.promoCode}]</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-vermilion">
                      −{formatNgn(order.discount)}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-line/60">
                  <td colSpan={3} className="px-4 py-2.5 text-right text-paper-60">
                    Delivery fee
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-paper-70">
                    {formatNgn(order.deliveryFee)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right text-paper">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-base tabular-nums text-paper">
                    {formatNgn(subtotal - (order.discount ?? 0) + order.deliveryFee)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Status card — the tracker flow's main action */}
          <section className="card-admin p-4">
            <h2 className="mb-4 text-sm font-medium text-paper">Status</h2>
            <StatusTimeline status={order.status} />

            <div className="mt-2 border-t border-line pt-4">
              <label
                htmlFor="status-update"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Update status
              </label>
              <div className="flex gap-2">
                <select
                  id="status-update"
                  value={pendingStatus}
                  onChange={(e) =>
                    setPendingStatus(e.target.value as OrderStatus | '')
                  }
                  disabled={options.length === 0}
                  className="input-hairline flex-1"
                >
                  <option value="">
                    {options.length === 0
                      ? 'No forward moves'
                      : 'Choose status…'}
                  </option>
                  {options.map((s) => (
                    <option key={s} value={s}>
                      {s === 'in_transit' ? 'In transit' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void applyStatus()}
                  disabled={!pendingStatus}
                  className="btn-vermilion"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
                Forward only — no going back
              </p>
              {flash && (
                <p
                  role="status"
                  className={cn(
                    'mt-2 font-mono text-[11px]',
                    flash.kind === 'ok' ? 'text-moss-bright' : 'text-vermilion'
                  )}
                >
                  {flash.text}
                </p>
              )}
            </div>
          </section>

          {/* Customer card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Customer</h2>
            <p className="text-sm text-paper">{order.customerName}</p>
            <a
              href={`whatsapp://send?phone=${order.customerPhone.replace('+', '')}`}
              className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-paper-60 hover:text-moss-bright"
            >
              <MessageCircle size={13} aria-hidden />
              {order.customerPhone}
            </a>
            {order.customerEmail && (
              <p className="mt-1.5 font-mono text-xs text-paper-60">
                {order.customerEmail}
              </p>
            )}
            <p className="mt-2 text-sm text-paper-60">{order.deliveryAddress}</p>
          </section>

          {/* Payment card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Payment</h2>
            <dl className="space-y-2 font-mono text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Reference</dt>
                <dd className="tabular-nums text-paper">{order.paymentRef}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Amount</dt>
                <dd className="tabular-nums text-paper">
                  {formatNgn(subtotal - (order.discount ?? 0) + order.deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Date</dt>
                <dd className="tabular-nums text-paper-70">
                  {order.paymentDate ? formatDateTime(order.paymentDate) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Status</dt>
                <dd>
                  <span
                    className={cn(
                      order.paymentStatus === 'paid' ? 'text-moss-bright' : 'text-vermilion'
                    )}
                  >
                    {order.paymentStatus}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          {/* Notes */}
          <section className="card-admin p-4">
            <h2 className="mb-1.5 text-sm font-medium text-paper">Internal notes</h2>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
              Not visible to the customer
            </p>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Packaging notes, rider details…"
              aria-label="Internal notes"
              className="input-hairline resize-y"
            />
            <button
              type="button"
              onClick={() => void saveNotes()}
              disabled={savingNotes || notes === (order.notes ?? '')}
              className="btn-ghost-dark mt-2 w-full disabled:opacity-40"
            >
              {savingNotes ? 'Saving…' : 'Save notes'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
