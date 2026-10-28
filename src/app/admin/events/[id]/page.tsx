'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { StatusChip } from '@/components/admin/status-chip';
import { EventEditor } from '@/components/admin/event-editor';
import {
  fetchEvent,
  fetchEventRegistrations,
  notifyWaitlist,
} from '@/lib/events-api';
import type { EventRegistrationRow, EventRow, EventWaitlistRow } from '@/lib/types';
import { formatNgn, formatDateTime } from '@/lib/format';

/**
 * One event (Tier 6): the editor plus the registrations screen, on one
 * page (the Orders convention is list → detail; an event's detail IS
 * its money, so the tables live beside the editor rather than a click
 * away).
 *
 * Tabs: Paid / Pending / Needs review / Waitlist — the same four
 * vocabulary words the DB and the storefront use, so nothing is
 * re-labelled at the UI boundary.
 */

type RegTab = 'paid' | 'pending' | 'review' | 'waitlist';

const REG_TABS: Array<{ key: RegTab; label: string }> = [
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'review', label: 'Needs review' },
  { key: 'waitlist', label: 'Waitlist' },
];

/** Review rows sit in their own tab even though they are paid — they
 *  are exactly the refunds/honour decisions, never the door list. */
function bucketOf(row: EventRegistrationRow): RegTab {
  if (row.needsReview) return 'review';
  return row.paymentStatus === 'paid' ? 'paid' : 'pending';
}

export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistrationRow[]>([]);
  const [waitlist, setWaitlist] = useState<EventWaitlistRow[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<RegTab>('paid');
  const [notifyBusy, setNotifyBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchEvent(id)
      .then((data) => {
        setEvent(data.event);
        setFailed(null);
      })
      .catch((error) => setFailed((error as Error).message));
    fetchEventRegistrations(id)
      .then((data) => {
        setRegistrations(data.registrations ?? []);
        setWaitlist(data.waitlist ?? []);
      })
      .catch(() => {
        // the tables stay empty; the event header still renders
      });
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => {
    const c: Record<RegTab, number> = { paid: 0, pending: 0, review: 0, waitlist: waitlist.length };
    for (const row of registrations) {
      if (row.paymentStatus === 'refunded') continue; // settled, hidden
      c[bucketOf(row)] += 1;
    }
    return c;
  }, [registrations, waitlist]);

  const tableRows = useMemo(() => {
    if (tab === 'waitlist') return [];
    return registrations.filter(
      (row) => row.paymentStatus !== 'refunded' && bucketOf(row) === tab,
    );
  }, [registrations, tab]);

  const onNotify = async (entryId: string) => {
    setNotifyBusy(entryId);
    setNote(null);
    try {
      await notifyWaitlist(entryId);
      setNote('Sent — the person has the registration link, and the entry is marked notified.');
      reload();
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setNotifyBusy(null);
    }
  };

  if (failed) {
    return (
      <div>
        <PageHeader title="Event" />
        <p role="alert" className="font-mono text-[11px] text-vermilion">
          {failed}
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div>
        <PageHeader title="Event" />
        <p className="font-mono text-[11px] text-paper-40">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={event.name}
        subtitle={`${event.seatsTaken} seats${event.capacity === null ? '' : ` / ${event.capacity}`}`}
        right={
          <div className="flex items-center gap-2">
            <StatusChip status={event.status} />
            <Link
              href="/admin/events"
              className="font-mono text-[11px] text-paper-60 underline-offset-4 hover:text-paper hover:underline"
            >
              ← All events
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ------------------------- editor ------------------------- */}
        <div>
          <EventEditor initial={event} />
        </div>

        {/* ------------------- registrations ----------------------- */}
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {REG_TABS.map((t) => (
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

          {note && (
            <p role="status" className="mb-3 font-mono text-[11px] leading-snug text-moss-bright">
              {note}
            </p>
          )}

          {tab === 'waitlist' ? (
            waitlist.length === 0 ? (
              <div className="card-admin p-6 text-center">
                <p className="font-mono text-[11px] text-paper-50">
                  Nobody is waiting — the waitlist form only appears when this event is full.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {['Person', 'Asked', ''].map((h) => (
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
                    {waitlist.map((entry) => (
                      <tr key={entry.id} className="border-b border-line/60">
                        <td className="px-3 py-3">
                          <p className="font-mono text-[13px] text-paper">{entry.name}</p>
                          <p className="font-mono text-[11px] text-paper-50">{entry.email}</p>
                          <p className="font-mono text-[11px] text-paper-40">{entry.phone}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-paper-50">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {entry.status === 'notified' ? (
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-moss-bright">
                              Notified
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onNotify(entry.id)}
                              disabled={notifyBusy === entry.id}
                              className="rounded-card border border-kraft-30 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper hover:border-kraft-60 disabled:opacity-50"
                            >
                              {notifyBusy === entry.id ? 'Sending…' : 'Notify'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 font-mono text-[10px] leading-snug text-paper-40">
                  Notify emails the person that a spot opened — nothing is held for them;
                  whoever registers first takes the seat. Nothing here is charged.
                </p>
              </div>
            )
          ) : tableRows.length === 0 ? (
            <div className="card-admin p-6 text-center">
              <p className="font-mono text-[11px] text-paper-50">
                {counts[tab] === 0 ? 'Nothing here yet.' : 'Nothing matches.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse">
                <thead>
                  <tr className="border-b border-line text-left">
                    {['Attendee', 'Registered', 'Paid', 'Ticket', 'Reference'].map((h) => (
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
                  {tableRows.map((row) => (
                    <tr key={row.id} className="border-b border-line/60">
                      <td className="px-3 py-3">
                        <p className="font-mono text-[13px] text-paper">{row.attendeeName}</p>
                        <p className="font-mono text-[11px] text-paper-50">{row.attendeeEmail}</p>
                        <p className="font-mono text-[11px] text-paper-40">{row.attendeePhone}</p>
                        {row.needsReview && (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-vermilion">
                            {row.reviewReason === 'capacity_shortfall'
                              ? 'Capacity race — refund or honour'
                              : row.reviewReason === 'amount_mismatch'
                                ? 'Amount mismatch — refund'
                                : row.reviewReason}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-paper-50">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] tabular-nums text-paper">
                        {row.paymentStatus === 'paid'
                          ? formatNgn(row.pricePaid)
                          : row.paymentStatus}
                        {row.paymentDate && (
                          <span className="ml-1 text-[10px] text-paper-40">
                            {formatDateTime(row.paymentDate)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-paper-60">
                        {row.registrationNumber}
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-paper-40">
                        {row.reference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tab === 'review' && (
                <p className="mt-3 font-mono text-[10px] leading-snug text-paper-40">
                  These payments were taken but flagged — resolve them in the Paystack
                  dashboard (refund) or accept them (the ticket then stands). They do not
                  count against capacity while flagged.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
