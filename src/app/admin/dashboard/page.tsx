'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, PenLine, Ticket } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { MonoStat } from '@/components/admin/mono-stat';
import { StatusChip } from '@/components/admin/status-chip';
import { orders as seedOrders, orderTotal, orderItemCount } from '@/data/mock/orders';
import { products as seedProducts } from '@/data/mock/products';
import { fetchOrders } from '@/lib/orders-api';
import { fetchProducts } from '@/lib/catalog-api';
import type { Order, Product } from '@/lib/types';
import { formatNgn, formatShortDate } from '@/lib/format';

const quickActions = [
  { label: 'Add product', href: '/admin/products/new', icon: Plus },
  { label: 'Write post', href: '/admin/blog/new', icon: PenLine },
  { label: 'Create promo code', href: '/admin/promo-codes', icon: Ticket },
];

export default function DashboardPage() {
  const router = useRouter();

  // Seeds paint instantly; the database is the source of truth (same
  // pattern as Products/Orders). Deltas compare against the previous
  // month of REAL orders — no hardcoded comparators.
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  useEffect(() => {
    let live = true;
    fetchOrders()
      .then((data) => {
        if (live) setOrders(data);
      })
      .catch(() => {
        // offline — the seed stays as the fallback
      });
    fetchProducts()
      .then((data) => {
        if (live) setProducts(data);
      })
      .catch(() => {
        // offline — the seed stays as the fallback
      });
    return () => {
      live = false;
    };
  }, []);

  const monthKey = new Date().toISOString().slice(0, 7);
  const lastMonthKey = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 7);

  const thisMonthOrders = orders.filter((o) => o.createdAt.startsWith(monthKey));
  const lastMonthOrders = orders.filter((o) => o.createdAt.startsWith(lastMonthKey));
  const revenue = thisMonthOrders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + orderTotal(o), 0);
  const lastRevenue = lastMonthOrders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + orderTotal(o), 0);
  const pctDelta = (now: number, before: number): number | undefined =>
    before === 0 ? undefined : Math.round(((now - before) / before) * 100);

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const reviewCount = orders.filter((o) => o.needsReview).length;
  const lowStock = products.filter((p) => p.stock < 5);
  const recent = [...orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={today} />

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MonoStat
          label="Orders this month"
          value={String(thisMonthOrders.length)}
          delta={pctDelta(thisMonthOrders.length, lastMonthOrders.length)}
        />
        <MonoStat
          label="Revenue this month"
          value={formatNgn(revenue)}
          delta={pctDelta(revenue, lastRevenue)}
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

      {reviewCount > 0 && (
        <p
          role="note"
          className="mt-4 flex items-center gap-2 rounded-card border border-vermilion/60 bg-vermilion/10 px-4 py-3"
        >
          <span className="font-mono text-[11px] leading-relaxed text-vermilion">
            <span className="uppercase tracking-[0.16em]">Needs review</span> —
            {' '}{reviewCount} paid{' '}{reviewCount === 1 ? 'order was' : 'orders were'}{' '}
            flagged by the payment confirmation flow (amount mismatch, stock
            shortfall or a cancelled order that still got paid).
          </span>
          <Link
            href="/admin/orders"
            className="ml-auto shrink-0 font-mono text-[11px] text-vermilion underline underline-offset-4"
          >
            Review →
          </Link>
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent orders */}
        <section className="card-admin overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-paper">
              Recent orders
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
