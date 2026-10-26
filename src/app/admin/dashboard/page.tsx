'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Info, Plus, PenLine, Ticket } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { MonoStat } from '@/components/admin/mono-stat';
import { StatusChip } from '@/components/admin/status-chip';
import { orders, orderTotal, orderItemCount } from '@/data/mock/orders';
import { products } from '@/data/mock/products';
import { formatNgn, formatShortDate } from '@/lib/format';

/** Last month's figures — stand-in comparators until the backend lands. */
const LAST_MONTH = { orders: 7, revenue: 148500 };

/** Marks any figure below as sample data — none of it is real orders. */
function DemoChip() {
  return (
    <span className="rounded-card border border-dashed border-kraft-30 bg-kraft-12 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-kraft">
      Demo data
    </span>
  );
}

const quickActions = [
  { label: 'Add product', href: '/admin/products/new', icon: Plus },
  { label: 'Write post', href: '/admin/blog/new', icon: PenLine },
  { label: 'Create promo code', href: '/admin/promo-codes', icon: Ticket },
];

export default function DashboardPage() {
  const router = useRouter();

  const thisMonthOrders = orders.filter((o) => o.createdAt.startsWith('2026-10'));
  const revenue = thisMonthOrders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + orderTotal(o), 0);
  const ordersDelta = Math.round(
    ((thisMonthOrders.length - LAST_MONTH.orders) / LAST_MONTH.orders) * 100
  );
  const revenueDelta = Math.round(
    ((revenue - LAST_MONTH.revenue) / LAST_MONTH.revenue) * 100
  );

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const lowStock = products.filter((p) => p.stock < 5);
  const recent = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Tuesday, 22 October 2026" />

      {/* Every number on this page is mock data until checkout is live;
          the label makes sure none of it reads as real revenue */}
      <p
        role="note"
        className="mb-5 flex items-center gap-2 rounded-card border border-dashed border-kraft-30 bg-kraft-12 px-4 py-3"
      >
        <Info size={14} aria-hidden className="shrink-0 text-kraft" />
        <span className="font-mono text-[11px] leading-relaxed text-kraft">
          <span className="uppercase tracking-[0.16em]">Demo data</span> —
          orders, revenue and stock figures below are samples until checkout
          is live.
        </span>
      </p>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MonoStat
          label="Orders this month"
          value={String(thisMonthOrders.length)}
          delta={ordersDelta}
        />
        <MonoStat
          label="Revenue this month"
          value={formatNgn(revenue)}
          delta={revenueDelta}
        />
        <MonoStat
          label="Pending orders"
          value={String(pendingCount)}
          href="/admin/orders?status=pending"
        />
        <MonoStat
          label="Low stock products"
          value={String(lowStock.length)}
          href="/admin/products?filter=low-stock"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent orders */}
        <section className="card-admin overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-paper">
              Recent orders
              <DemoChip />
            </h2>
            <Link
              href="/admin/orders"
              className="font-mono text-[11px] text-paper-60 hover:text-paper"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                  <th scope="col" className="px-4 py-2.5 font-normal">Order</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Customer</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">Items</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">Amount</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
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
                    <td className="px-4 py-3"><StatusChip status={order.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-paper-60">
                      {formatShortDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right column */}
        <div className="space-y-4">
          <section className="card-admin">
            <h2 className="border-b border-line px-4 py-3 text-sm font-medium text-paper">
              Quick actions
            </h2>
            <ul>
              {quickActions.map((action) => (
                <li key={action.href} className="border-b border-line/60 last:border-0">
                  <Link
                    href={action.href}
                    className="flex h-12 items-center justify-between px-4 text-sm text-paper-70 transition-colors hover:bg-paper-12 hover:text-paper"
                  >
                    <span className="flex items-center gap-3">
                      <action.icon size={15} aria-hidden className="text-kraft-60" />
                      {action.label}
                    </span>
                    <ArrowRight size={15} aria-hidden className="text-paper-40" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card-admin">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-paper">
                Low stock alert
                <DemoChip />
              </h2>
              <span className="font-mono text-[11px] text-vermilion">
                {lowStock.length}
              </span>
            </div>
            {lowStock.length === 0 ? (
              <p className="px-4 py-4 font-mono text-xs text-paper-60">
                Everything is above threshold.
              </p>
            ) : (
              <ul>
                {lowStock.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 text-sm last:border-0"
                  >
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="truncate text-paper-70 hover:text-paper"
                    >
                      {product.name}
                    </Link>
                    <span className="ml-3 shrink-0 font-mono text-xs tabular-nums text-vermilion">
                      {product.stock} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
