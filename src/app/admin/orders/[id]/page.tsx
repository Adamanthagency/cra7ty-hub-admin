'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { StatusChip } from '@/components/admin/status-chip';
import { StatusTimeline, forwardStatuses } from '@/components/admin/status-timeline';
import { orders, orderSubtotal } from '@/data/mock/orders';
import type { OrderStatus } from '@/lib/types';
import { formatNgn, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const seed = orders.find((o) => o.id === params.id);

  // Local state so status updates re-render chip + timeline immediately.
  const [status, setStatus] = useState<OrderStatus | undefined>(seed?.status);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | ''>('');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  const [savedNote, setSavedNote] = useState(false);

  if (!seed || status === undefined) {
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

  const subtotal = orderSubtotal(seed);
  const options = forwardStatuses(status);

  const applyStatus = () => {
    if (!pendingStatus) return;
    setStatus(pendingStatus);
    setPendingStatus('');
    setSavedNote(true);
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
          Order {seed.id}
        </h1>
        <StatusChip status={status} />
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
                {seed.items.map((item, i) => (
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
                {seed.discount !== undefined && seed.discount > 0 && (
                  <tr className="border-b border-line/60">
                    <td colSpan={3} className="px-4 py-2.5 text-right text-paper-60">
                      Discount{' '}
                      <span className="text-vermilion">[{seed.promoCode}]</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-vermilion">
                      −{formatNgn(seed.discount)}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-line/60">
                  <td colSpan={3} className="px-4 py-2.5 text-right text-paper-60">
                    Delivery fee
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-paper-70">
                    {formatNgn(seed.deliveryFee)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right text-paper">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-base tabular-nums text-paper">
                    {formatNgn(subtotal - (seed.discount ?? 0) + seed.deliveryFee)}
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
            <StatusTimeline status={status} />

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
                  onClick={applyStatus}
                  disabled={!pendingStatus}
                  className="btn-vermilion"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
                Forward only — no going back
              </p>
              {savedNote && (
                <p role="status" className="mt-2 font-mono text-[11px] text-moss-bright">
                  Status updated — local state only.
                </p>
              )}
            </div>
          </section>

          {/* Customer card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Customer</h2>
            <p className="text-sm text-paper">{seed.customerName}</p>
            <a
              href={`whatsapp://send?phone=${seed.customerPhone.replace('+', '')}`}
              className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-paper-60 hover:text-moss-bright"
            >
              <MessageCircle size={13} aria-hidden />
              {seed.customerPhone}
            </a>
            <p className="mt-2 text-sm text-paper-60">{seed.deliveryAddress}</p>
          </section>

          {/* Payment card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Payment</h2>
            <dl className="space-y-2 font-mono text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Reference</dt>
                <dd className="tabular-nums text-paper">{seed.paymentRef}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Amount</dt>
                <dd className="tabular-nums text-paper">
                  {formatNgn(subtotal - (seed.discount ?? 0) + seed.deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Date</dt>
                <dd className="tabular-nums text-paper-70">
                  {formatDateTime(seed.paymentDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-paper-60">Status</dt>
                <dd>
                  <span
                    className={cn(
                      seed.paymentStatus === 'paid' ? 'text-moss-bright' : 'text-vermilion'
                    )}
                  >
                    {seed.paymentStatus}
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
          </section>
        </div>
      </div>
    </div>
  );
}
