'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { StatusChip } from '@/components/admin/status-chip';
import { deleteEventPost, fetchEventPosts } from '@/lib/event-posts-api';
import type { EventPost } from '@/lib/types';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The Event posts list — the public Events announcement feed.
 *
 * Same conventions as the Blog list (Published/Drafts tabs, row cards,
 * live-status banner) minus the seed fallback: an invented
 * announcement would be a lie, so the list starts empty and hydrates
 * from the API — the posture the events manager already uses.
 *
 * Each row shows the announced date (the axis this feed is organized
 * by), a link chip when the post points at a workshop page, and the
 * usual edit/delete actions. SEPARATE FROM TIER 6: this list reads
 * only event_posts, never events/registrations.
 */
export default function EventPostsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EventPost[]>([]);
  const [liveStatus, setLiveStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tab, setTab] = useState<'published' | 'draft'>('published');

  useEffect(() => {
    let cancelled = false;
    fetchEventPosts()
      .then((posts) => {
        if (cancelled) return;
        setRows(posts);
        setLiveStatus('live');
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLiveStatus('offline');
        setLiveError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Delete on the server first; the row only leaves the list on success. */
  const remove = async (id: string) => {
    setSaveError(null);
    try {
      await deleteEventPost(id);
      setRows((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const counts = useMemo(
    () => ({
      published: rows.filter((p) => p.status === 'published').length,
      draft: rows.filter((p) => p.status === 'draft').length,
    }),
    [rows],
  );

  const visible = useMemo(
    () =>
      rows
        .filter((p) => p.status === tab)
        // Soonest upcoming first among published; drafts newest-edited first.
        .sort((a, b) =>
          tab === 'published'
            ? a.eventDate.localeCompare(b.eventDate)
            : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [rows, tab],
  );

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle={`${rows.length} post${rows.length === 1 ? '' : 's'}`}
        right={
          <Link href="/admin/event-posts/new" className="btn-vermilion">
            <Plus size={15} aria-hidden />
            New event post
          </Link>
        }
      />

      {/* Live status — never let a local-only list pretend to be the site */}
      {liveStatus === 'loading' && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">Loading live event posts…</p>
      )}
      {liveStatus === 'live' && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">
          Live — these are the rows /events reads. Workshops and exhibitions are managed under
          Workshops/Exhibitions.
        </p>
      )}
      {liveStatus === 'offline' && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          Could not reach the server — showing the local copy ({liveError}). Nothing here has been
          saved to the site.
        </p>
      )}
      {saveError && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          {saveError}
        </p>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Event post status" className="mb-4 flex gap-1">
        {(['published', 'draft'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-card border px-3 font-mono text-[11px] transition-colors',
              tab === t
                ? 'border-vermilion text-vermilion'
                : 'border-line text-paper-60 hover:border-paper-40 hover:text-paper',
            )}
          >
            {t === 'published' ? 'Published' : 'Drafts'}
            <span className="tabular-nums text-paper-40">{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="card-admin overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="font-mono text-xs text-paper-60">
              {rows.length === 0
                ? 'No event posts yet — announcements for open days, showcases and studio news live here.'
                : `No ${tab === 'draft' ? 'drafts' : 'published posts'}.`}
            </p>
            {rows.length === 0 && (
              <Link
                href="/admin/event-posts/new"
                className="mt-4 inline-block rounded-card border border-kraft-30 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper hover:border-kraft-60"
              >
                Write the first announcement
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {visible.map((post) => (
              <li
                key={post.id}
                className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 transition-colors last:border-0 hover:bg-paper-12"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/admin/event-posts/${post.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-paper">{post.title}</span>
                    {post.linkUrl && (
                      <span className="inline-flex items-center gap-1 rounded-card border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-paper-60">
                        <ExternalLink size={9} aria-hidden />
                        {post.linkLabel}
                      </span>
                    )}
                  </span>
                  {post.description && (
                    <span className="mt-0.5 block truncate text-xs text-paper-60">
                      {post.description}
                    </span>
                  )}
                </button>

                <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-paper-60 sm:block">
                  {safeShortDate(post.eventDate)}
                </span>
                <span className="hidden shrink-0 md:block">
                  <StatusChip status={post.status === 'published' ? 'active' : 'inactive'} />
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${post.title}`}
                    onClick={() => router.push(`/admin/event-posts/${post.id}`)}
                    className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${post.title}`}
                    onClick={() => void remove(post.id)}
                    className="rounded-card p-2 text-paper-60 hover:bg-vermilion-20 hover:text-vermilion"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Tolerant date display — an unreadable date must not crash the list. */
function safeShortDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? formatShortDate(iso) : iso;
}
