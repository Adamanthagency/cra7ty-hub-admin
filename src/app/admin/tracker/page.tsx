'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { StatusChip } from '@/components/admin/status-chip';
import { StatusTimeline, forwardStatuses } from '@/components/admin/status-timeline';
import { orders as seed, orderItemCount, orderTotal } from '@/data/mock/orders';
import { fetchOrders, setOrderStatus } from '@/lib/orders-api';
import type { Order, OrderStatus } from '@/lib/types';
import { formatDateTime, formatNgn } from '@/lib/format';
import { cn } from '@/lib/utils';

function statusOptions(current: OrderStatus): OrderStatus[] {
  return forwardStatuses(current);
}

export default function TrackerPage() {
  // One local state tree: summary strip, rows and timeline all read it,
  // so status changes reflect everywhere at once (no hardcoding).
  // Seed first for instant paint, then hydrate from the real orders table.
  const [state, setState] = useState<Order[]>(seed);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchOrders()
      .then((data) => {
        if (live) setState(data);
      })
      .catch(() => {
        // backend unreachable — the seed stays as the fallback
      });
    return () => {
      live = false;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const summary = useMemo(
    () => ({
      inTransit: state.filter((o) => o.status === 'in_transit').length,
      deliveredToday: state.filter(
        (o) => o.status === 'delivered' && o.updatedAt.startsWith(today)
      ).length,
      pending: state.filter((o) => o.status === 'pending').length,
    }),
    [state, today]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state
      .filter(
        (o) =>
          !q ||
          o.id.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 10);
  }, [state, query]);

  // The database enforces forward-only (apply_order_status) — a rejected
  // jump keeps the row unchanged; the server's answer is the truth.
  const setStatus = (id: string, next: OrderStatus) => {
    setOrderStatus(id, next)
      .then((updated) => {
        setState((prev) => prev.map((o) => (o.id === id ? updated : o)));
      })
      .catch(() => {
        // illegal transition or offline: keep the current row as-is
      });
  };

  return (
    <div>
      <PageHeader title="Tracker" subtitle="Quick status updates" />

      {/* Summary strip — computed from the same state the rows mutate */}
      <div className="card-admin mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 font-mono text-xs tabular-nums">
        <span className="text-transit">{summary.inTransit} in transit</span>
        <span aria-hidden className="text-paper-40">·</span>
        <span className="text-moss-bright">{summary.deliveredToday} delivered today</span>
        <span aria-hidden className="text-paper-40">·</span>
        <span className="text-kraft">{summary.pending} pending</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-40"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by order ID or customer phone"
          aria-label="Search by order ID or customer phone"
          className="input-hairline h-11 pl-9 text-[15px]"
        />
      </div>

      <div className="card-admin overflow-hidden">
        <div className="hidden border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60 sm:grid sm:grid-cols-[1fr_1.4fr_1fr_1.2fr_1.4fr_auto] sm:gap-3">
          <span>Order</span>
          <span>Customer</span>
          <span>Status</span>
          <span>Last updated</span>
          <span>Quick update</span>
          <span className="sr-only">Expand</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center font-mono text-xs text-paper-60">
            No orders match “{query}”.
          </p>
        ) : (
          <ul>
            {rows.map((order) => {
              const expanded = expandedId === order.id;
              const options = statusOptions(order.status);
              return (
                <li key={order.id} className="border-b border-line/60 last:border-0">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => setExpandedId((cur) => (cur === order.id ? null : order.id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId((cur) => (cur === order.id ? null : order.id));
                      }
                    }}
                    className="grid cursor-pointer grid-cols-1 items-center gap-2 px-4 py-3 transition-colors hover:bg-paper-12 sm:grid-cols-[1fr_1.4fr_1fr_1.2fr_1.4fr_auto] sm:gap-3"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs text-paper">
                      {order.id}
                      <ChevronDown
                        size={13}
                        aria-hidden
                        className={cn(
                          'text-paper-40 transition-transform',
                          expanded && 'rotate-180'
                        )}
                      />
                    </span>
                    <span className="truncate text-sm text-paper-70">
                      {order.customerName}
                    </span>
                    <span>
                      <StatusChip status={order.status} />
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-paper-60">
                      {formatDateTime(order.updatedAt)}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <select
                        value=""
                        aria-label={`Update status for ${order.id}`}
                        disabled={options.length === 0}
                        onChange={(e) => {
                          if (e.target.value) setStatus(order.id, e.target.value as OrderStatus);
                        }}
                        className="input-hairline h-9 py-1 font-mono text-[11px]"
                      >
                        <option value="">
                          {options.length === 0 ? 'No forward moves' : 'Set status…'}
                        </option>
                        {options.map((s) => (
                          <option key={s} value={s}>
                            {s === 'in_transit' ? 'In transit' : s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="hidden text-right font-mono text-[10px] text-paper-40 sm:block">
                      {expanded ? '−' : '+'}
                    </span>
                  </div>

                  {/* Inline expansion: timeline + control */}
                  {expanded && (
                    <div className="border-t border-line/60 bg-bg/50 px-4 py-4">
                      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-[14rem]">
                          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                            Status timeline
                          </h3>
                          <StatusTimeline status={order.status} />
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px]">
                          <dt className="text-paper-60">Items</dt>
                          <dd className="tabular-nums text-paper-70">
                            {orderItemCount(order)}
                          </dd>
                          <dt className="text-paper-60">Total</dt>
                          <dd className="tabular-nums text-paper">{formatNgn(orderTotal(order))}</dd>
                          <dt className="text-paper-60">Phone</dt>
                          <dd className="tabular-nums text-paper-70">{order.customerPhone}</dd>
                          <dt className="text-paper-60">Address</dt>
                          <dd className="text-paper-70">{order.deliveryAddress}</dd>
                        </dl>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
        Showing {rows.length} of {state.length} · most recently updated first
      </p>
    </div>
  );
}
