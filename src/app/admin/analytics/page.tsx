'use client';

import { PageHeader } from '@/components/admin/page-header';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

/**
 * Scaffold only. Each tile renders a real (empty) shadcn/recharts chart
 * with zero data, so wiring the backend is a data swap — the axes and
 * container are already live.
 */

const ZERO_SERIES = [
  { label: 'A', value: 0 },
  { label: 'B', value: 0 },
  { label: 'C', value: 0 },
  { label: 'D', value: 0 },
];

const lineConfig = {
  value: { label: 'Value', color: '#d9c7a7' },
} satisfies ChartConfig;

const barConfig = {
  value: { label: 'Value', color: '#3e5641' },
} satisfies ChartConfig;

function EmptyState({ chartKey }: { chartKey: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-card border border-kraft-30 bg-kraft-12 px-4 py-3 text-center">
        <p className="font-mono text-[11px] leading-relaxed text-kraft">
          Data will appear here once orders are live
        </p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-kraft-60">
          {chartKey}
        </p>
      </div>
    </div>
  );
}

function ChartTile({
  title,
  chartKey,
  type,
}: {
  title: string;
  chartKey: string;
  type: 'line' | 'bar';
}) {
  return (
    <section className="card-admin p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-paper">{title}</h2>
        <span className="rounded-card border border-kraft-30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-kraft-60">
          Coming soon
        </span>
      </div>
      <div className="relative">
        <ChartContainer config={type === 'line' ? lineConfig : barConfig} className="h-48 w-full">
          {type === 'line' ? (
            <LineChart data={ZERO_SERIES} margin={{ left: 8, right: 8, top: 8 }}>
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
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                width={32}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="value"
                type="monotone"
                stroke="#d9c7a7"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart data={ZERO_SERIES} margin={{ left: 8, right: 8, top: 8 }}>
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
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                width={32}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="#3e5641" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ChartContainer>
        <EmptyState chartKey={chartKey} />
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="Analytics"
        right={
          <span className="rounded-card border border-kraft-30 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-kraft-60">
            Coming soon
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartTile title="Revenue over time" chartKey="revenue-over-time" type="line" />
        <ChartTile title="Orders by status" chartKey="orders-by-status" type="bar" />
        <ChartTile title="Top products by revenue" chartKey="top-products" type="bar" />
        <ChartTile title="Promo code usage" chartKey="promo-usage" type="line" />
      </div>
    </div>
  );
}
