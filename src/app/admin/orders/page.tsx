'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { StatusChip, statusLabelFor } from '@/components/admin/status-chip';
import { orders, orderTotal, orderItemCount } from '@/data/mock/orders';
import type { OrderStatus } from '@/lib/types';
import { formatNgn, formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS: Array<{ key: OrderStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status');

  const [tab, setTab] = useState<OrderStatus | 'all'>(
    TABS.some((t) => t.key === initialStatus) ? (initialStatus as OrderStatus) : 'all'
  );
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const t of TABS) {
      if (t.key !== 'all') c[t.key] = orders.filter((o) => o.status === t.key).length;
    }
    return c;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => (tab === 'all' ? true : o.status === tab))
      .filter(
        (o) =>
          !q ||
          o.id.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [tab, query]);

  return (
    <div>
      <PageHeader title="Orders" subtitle={`${orders.length} total`} />

      {/* Filter bar */}
      <div className="mb-4 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by order ID or customer…"
          aria-label="Search orders"
          className="input-hairline w-full sm:w-80"
        />
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex gap-1 overflow-x-auto pb-1"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-card border px-3 font-mono text-[11px] transition-colors',
                tab === t.key
                  ? 'border-vermilion text-vermilion'
                  : 'border-line text-paper-60 hover:border-paper-40 hover:text-paper'
              )}
            >
              {t.label}
              <span className="tabular-nums text-paper-40">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card-admin overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                <th scope="col" className="px-4 py-2.5 font-normal">Order</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Customer</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Items</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Payment</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
                <th scope="col" className="px-4 py-2.5 font-normal">WhatsApp</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center font-mono text-xs text-paper-60"
                  >
                    No orders match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/admin/orders/${order.id}`)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper-12"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-paper">{order.id}</td>
                    <td className="px-4 py-3 text-paper-70">{order.customerName}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper-70">
                      {orderItemCount(order)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper">
                      {formatNgn(orderTotal(order))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'font-mono text-[11px]',
                          order.paymentStatus === 'paid' ? 'text-paper-70' : 'text-vermilion'
                        )}
                      >
                        {order.paymentRef}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={order.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`whatsapp://send?phone=${order.customerPhone.replace('+', '')}`}
                        aria-label={`WhatsApp ${order.customerName}`}
                        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-moss-bright"
                      >
                        <MessageCircle size={13} aria-hidden />
                        {order.customerPhone}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-paper-60">
                      {formatShortDate(order.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
        {statusLabelFor(tab === 'all' ? 'all' : tab)} · {filtered.length} shown
      </p>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersContent />
    </Suspense>
  );
}
