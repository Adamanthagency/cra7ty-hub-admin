'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import { StatusChip } from '@/components/admin/status-chip';
import { fetchEvents } from '@/lib/events-api';
import type { EventRow } from '@/lib/types';
import { formatNgn, formatShortDate } from '@/lib/format';

/**
 * The events manager list (Tier 6) — same conventions as Orders:
 * tabs that filter, a search box, one table, a chip per row. No seed
 * fallback (events have no mock era): the list starts empty and says
 * so, then hydrates from the API.
 *
 * The seat column reads like the Orders totals column: the number the
 * admin actually manages by — "12/30", "12/∞", with the full/waitlist
 * counts as chips when they exist.
 */

type TabKey = 'upcoming' | 'past' | 'drafts' | 'cancelled';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** Which tab owns an event: published+future → upcoming, etc. */
function tabOf(event: EventRow): TabKey {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'drafts';
  return new Date(event.startsAt).getTime() > Date.now() ? 'upcoming' : 'past';
}

export default function AdminEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    fetchEvents()
      .then((data) => {
        if (!live) return;
        setRows(data.events ?? []);
        setLoading(false);
      })
      .catch((error) => {
        if (!live) return;
        setFailed((error as Error).message);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { upcoming: 0, past: 0, drafts: 0, cancelled: 0 };
    for (const event of rows) c[tabOf(event)] += 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((event) => tabOf(event) === tab)
      .filter(
        (event) =>
          !q ||
          event.name.toLowerCase().includes(q) ||
          event.slug.includes(q) ||
          event.kind.includes(q),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [rows, tab, query]);

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle={`${rows.length} total`}
        right={
          <Link
            href="/admin/events/new"
            className="rounded-card border border-kraft-30 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper hover:border-kraft-60"
          >
            + New event
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-card border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
              tab === t.key
                ? 'border-kraft-30 bg-kraft/15 text-paper'
                : 'border-line text-paper-50 hover:text-paper'
            }`}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums text-paper-40">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or slug…"
        className="mb-4 w-full max-w-sm rounded-card border border-kraft-30/70 bg-paper/[0.03] px-3 py-2 font-mono text-[13px] text-paper outline-none placeholder:text-paper-30 focus:border-kraft-30"
      />

      {failed && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          Could not load events — {failed}
        </p>
      )}
      {loading && !failed && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">Loading…</p>
      )}

      {!loading && !failed && filtered.length === 0 && (
        <div className="card-admin p-8 text-center">
          <p className="font-display text-lg text-paper">
            {rows.length === 0 ? 'No events yet.' : `Nothing in “${TABS.find((t) => t.key === tab)?.label}”.`}
          </p>
          <p className="mt-2 font-mono text-[11px] text-paper-50">
            {rows.length === 0
              ? 'Create the first workshop or exhibition — a draft is invisible to customers until you publish it.'
              : 'Try another tab, or clear the search.'}
          </p>
          {rows.length === 0 && (
            <Link
              href="/admin/events/new"
              className="mt-4 inline-block rounded-card border border-kraft-30 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper hover:border-kraft-60"
            >
              Create the first event
            </Link>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                {['Event', 'When', 'Kind', 'Entry', 'Seats', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-paper-40"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id} className="border-b border-line/60 hover:bg-paper/[0.02]">
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="font-mono text-[13px] text-paper underline-offset-4 hover:underline"
                    >
                      {event.name}
                    </Link>
                    <span className="ml-2 font-mono text-[10px] text-paper-40">/{event.slug}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-paper-60">
                    {formatShortDate(event.startsAt)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-paper-50">
                    {event.kind}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-paper">
                    {event.price === 0 ? 'Free' : formatNgn(event.price)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-paper">
                    {event.capacity === null
                      ? `${event.seatsTaken}/∞`
                      : `${event.seatsTaken}/${event.capacity}`}
                    {event.soldOut && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-vermilion">
                        Full
                      </span>
                    )}
                    {event.waitlistCount > 0 && (
                      <span className="ml-2 font-mono text-[10px] text-paper-40">
                        +{event.waitlistCount} waiting
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip status={event.status} />
                      {event.reviewCount > 0 && (
                        <span className="rounded-card border border-vermilion/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-vermilion">
                          {event.reviewCount} review
                        </span>
                      )}
                      {event.pendingCount > 0 && (
                        <span className="rounded-card border border-kraft-30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-kraft-60">
                          {event.pendingCount} pending
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="font-mono text-[11px] text-paper-60 underline-offset-4 hover:text-paper hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
