'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import { EventEditor } from '@/components/admin/event-editor';

/** Create one event (Tier 6) — same shape as /admin/products/new. */
export default function NewEventPage() {
  return (
    <div>
      <PageHeader
        title="New event"
        right={
          <Link
            href="/admin/events"
            className="font-mono text-[11px] text-paper-60 underline-offset-4 hover:text-paper hover:underline"
          >
            ← All events
          </Link>
        }
      />
      <EventEditor />
    </div>
  );
}
