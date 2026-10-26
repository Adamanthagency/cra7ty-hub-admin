'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { MonoStat } from '@/components/admin/mono-stat';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { fetchAnalytics, type AnalyticsSummary } from '@/lib/orders-api';
import { formatNgn } from '@/lib/format';

/**
 * Analytics — real aggregates from the orders table (Tier 4). The
 * endpoint computes everything server-side; this screen is a pure
 * render. Revenue counts PAID orders only, by payment date.
 *
 * The old scaffold's four "coming soon" tiles shrink to the three that
 * have honest data today (promo-code usage lives on the Promo codes
 * manager, per code) plus a totals strip.
 */

const lineConfig = {
  value: { label: 'Revenue', color: '#d9c7a7' },
} satisfies ChartConfig;

const barConfig = {
  value: { label: 'Orders', color: '#3e5641' },
} satisfies ChartConfig;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function ChartTile({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="card-admin p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-paper">{title}</h2>
        {note && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchAnalytics()
      .then((summary) => {
        if (live) setData(summary);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <div className="card-admin p-8 text-center">
          <p className="font-mono text-sm text-paper-60">
            Could not load analytics — {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <div className="card-admin p-8 text-center">
          <p className="font-mono text-sm text-paper-60">Loading analytics…</p>
        </div>
      </div>
    );
  }

  const statusRows = Object.entries(data.byStatus).map(([status, value]) => ({
    label: STATUS_LABELS[status] ?? status,
    value,
  }));

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle={`${data.totals.orders} orders · ${formatNgn(data.totals.revenue)} paid revenue`}
      />

      {/* Totals strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MonoStat label="Paid revenue" value={formatNgn(data.totals.revenue)} />
        <MonoStat label="Paid orders" value={String(data.totals.paidOrders)} />
        <MonoStat label="Delivered today" value={String(data.totals.deliveredToday)} />
        <MonoStat label="Needs review" value={String(data.totals.needsReview)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartTile title="Revenue, last 14 days" note="paid orders">
          <ChartContainer config={lineConfig} className="h-48 w-full">
            <LineChart data={data.days} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#3a3a3a"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#3a3a3a"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                width={40}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="revenue"
                type="monotone"
                stroke="#d9c7a7"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </ChartTile>

        <ChartTile title="Orders by status">
          <ChartContainer config={barConfig} className="h-48 w-full">
            <BarChart data={statusRows} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#3a3a3a"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#3a3a3a"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                width={32}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="#3e5641" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </ChartTile>

        <ChartTile title="Top products by units sold" note="paid orders">
          {data.topProducts.length === 0 ? (
            <p className="flex h-48 items-center justify-center font-mono text-xs text-paper-60">
              No paid orders yet.
            </p>
          ) : (
            <ChartContainer config={barConfig} className="h-48 w-full">
              <BarChart data={data.topProducts} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#3a3a3a"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={{ fontSize: 9, fontFamily: 'monospace' }}
                  angle={-20}
                  height={50}
                />
                <YAxis
                  stroke="#3a3a3a"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fontFamily: 'monospace' }}
                  width={32}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="units" fill="#3e5641" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          )}
        </ChartTile>

        <ChartTile title="Orders per day, last 14 days" note="paid orders">
          <ChartContainer config={barConfig} className="h-48 w-full">
            <BarChart data={data.days} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#3a3a3a"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
              />
              <YAxis
                stroke="#3a3a3a"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                width={32}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="orders" fill="#3e5641" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </ChartTile>
      </div>
    </div>
  );
}
