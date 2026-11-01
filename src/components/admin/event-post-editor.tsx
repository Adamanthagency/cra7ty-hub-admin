'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Images } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { MediaPicker } from '@/components/admin/workbench/media-picker';
import { MediaImg } from '@/components/admin/media-img';
import type { EventPost, EventPostStatus, MediaItem } from '@/lib/types';
import { fetchEvents } from '@/lib/events-api';
import { deleteEventPost, saveEventPost } from '@/lib/event-posts-api';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface EventPostEditorProps {
  initial: EventPost | null; // null = new post
}

/**
 * The Event post editor — the public Events announcement feed.
 *
 * Slimmer than BlogEditor because an announcement IS slimmer: title,
 * description, date, image, and an optional outbound link to one of the
 * studio's Tier 6 workshop/exhibition pages (so visitors register and
 * pay THERE — no payment, RSVP or registrant capture exists in this
 * feature). Layout mirrors BlogEditor: editor column + sidebar with the
 * Publish card and the image slot.
 *
 * The link dropdown reads the events manager's own list (published
 * rows only) and stores the resulting /workshops/<slug> path — the
 * admin cannot hand-type an absolute URL, so a post can never become
 * an open redirect. When the events list is unreachable the dropdown
 * degrades to a note; the post still saves and publishes without a
 * link.
 *
 * Publishing needs an image (client gate here, server gate in
 * validateEventPost) — an announcement card without one reads as
 * broken on /events. Drafts stay exempt.
 */
export function EventPostEditor({ initial }: EventPostEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [eventDate, setEventDate] = useState<string>(() => {
    if (initial) return toLocalInputValue(initial.eventDate);
    // Default to noon tomorrow — a fresh announcement is usually forward-looking.
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setHours(12, 0, 0, 0);
    return toLocalInputValue(d.toISOString());
  });
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [linkUrl, setLinkUrl] = useState<string | null>(initial?.linkUrl ?? null);
  const [linkLabel, setLinkLabel] = useState(initial?.linkLabel ?? 'Learn more');
  const [status, setStatus] = useState<EventPostStatus>(initial?.status ?? 'draft');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteIsError, setNoteIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Published Tier 6 events for the link dropdown (read-only reuse). */
  const [linkOptions, setLinkOptions] = useState<{ slug: string; name: string }[]>([]);
  const [linkOptionsFailed, setLinkOptionsFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchEvents()
      .then((data) => {
        if (cancelled) return;
        setLinkOptions(
          (data.events ?? [])
            .filter((e) => e.status === 'published')
            .map((e) => ({ slug: e.slug, name: e.name })),
        );
      })
      .catch(() => {
        // Graceful: the dropdown offers nothing, saving still works.
        if (!cancelled) setLinkOptionsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickImage = (item: MediaItem) => {
    setImageUrl(item.url);
    setPickerOpen(false);
  };

  const save = async (nextStatus: EventPostStatus) => {
    setNoteIsError(false);
    setNote(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setNoteIsError(true);
      setNote('The event post needs a title before it can be saved.');
      return;
    }
    if (!Number.isFinite(Date.parse(eventDate))) {
      setNoteIsError(true);
      setNote('Pick a valid date for the announcement.');
      return;
    }
    if (nextStatus === 'published' && !imageUrl) {
      setNoteIsError(true);
      setNote(
        'Publishing needs an image — pick one from the media library below, or save it as a draft.',
      );
      return;
    }

    const payload: EventPost = {
      // A new post gets its permanent id on first save; edits keep theirs.
      id: initial ? initial.id : `event-post-${crypto.randomUUID()}`,
      title: trimmedTitle,
      description: description.trim(),
      eventDate: new Date(eventDate).toISOString(),
      imageUrl,
      linkUrl,
      linkLabel: linkUrl ? linkLabel.trim() || 'Learn more' : 'Learn more',
      status: nextStatus,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const result = await saveEventPost(payload);
      setStatus(nextStatus);
      const refreshed = result.revalidate;
      if (nextStatus === 'published' && refreshed && !refreshed.ok) {
        setNoteIsError(true);
        setNote(
          `Saved, but refreshing the live site failed — ${refreshed.error ?? 'unknown error'}. The events page will catch up within about 5 minutes.`,
        );
      } else {
        setNote(
          nextStatus === 'published'
            ? refreshed
              ? `Published — the events page shows it now (site refreshed in ${refreshed.ms} ms).`
              : 'Published.'
            : 'Draft saved. Drafts never reach the live site.',
        );
      }
      if (!initial) router.push(`/admin/event-posts/${payload.id}`);
    } catch (error) {
      setNoteIsError(true);
      setNote((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** Delete is a real row removal — only offered on a saved post. */
  const remove = async () => {
    if (!initial) return;
    setNoteIsError(false);
    setNote(null);
    setSaving(true);
    try {
      await deleteEventPost(initial.id);
      router.push('/admin/event-posts');
    } catch (error) {
      setNoteIsError(true);
      setNote((error as Error).message);
      setSaving(false);
    }
  };

  return (
    <div>
      <Link
        href="/admin/event-posts"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden />
        All event posts
      </Link>

      <PageHeader
        title={initial ? 'Edit event post' : 'New event post'}
        subtitle={initial ? `ID ${initial.id}` : undefined}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Editor column */}
        <div className="min-w-0 flex-1">
          {/* Title — display serif, hairline bottom on focus */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
            aria-label="Event post title"
            className="w-full border-b border-transparent bg-transparent pb-2 font-display text-[28px] leading-tight text-paper outline-none transition-colors placeholder:text-paper-40 focus:border-paper-40"
          />

          {/* Description */}
          <div className="mt-4">
            <label
              htmlFor="event-post-description"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Description
            </label>
            <textarea
              id="event-post-description"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is happening, who it is for, what to expect. Shown on the card and truncated after a couple of lines."
              className="input-hairline resize-y"
            />
          </div>
        </div>

        {/* Sidebar — 220px */}
        <aside className="w-full shrink-0 space-y-4 lg:w-[220px]">
          {/* Publish card */}
          <section className="card-admin p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                Status
              </span>
              <span className="font-mono text-[11px] text-paper">{status}</span>
            </div>
            {initial && (
              <p className="mb-3 font-mono text-[11px] text-paper-60">
                {formatShortDate(initial.createdAt)}
              </p>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void save('draft')}
                disabled={saving}
                className="btn-ghost-dark w-full disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => void save('published')}
                disabled={saving}
                className="btn-vermilion w-full disabled:opacity-50"
              >
                Publish
              </button>
              {initial && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                  className="h-9 w-full rounded-card border border-vermilion/40 text-sm text-vermilion hover:bg-vermilion-20 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
            {note && (
              <p
                role={noteIsError ? 'alert' : 'status'}
                className={cn(
                  'mt-3 font-mono text-[11px] leading-snug',
                  noteIsError ? 'text-vermilion' : 'text-moss-bright',
                )}
              >
                {note}
              </p>
            )}
          </section>

          {/* Date */}
          <section className="card-admin p-3">
            <label
              htmlFor="event-post-date"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Date
            </label>
            <input
              id="event-post-date"
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="input-hairline font-mono"
            />
            <p className="mt-1 font-mono text-[10px] text-paper-50">
              Future dates sit under Upcoming; past dates move to Past.
            </p>
          </section>

          {/* Image */}
          <section className="card-admin p-3">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Image
            </span>
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-kraft-12 font-display text-2xl text-kraft-60">
              {imageUrl ? 'Image' : '—'}
              {imageUrl?.startsWith('http') && (
                <MediaImg
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-card border border-line px-2 font-mono text-[10px] text-paper-70 hover:border-paper-40 hover:text-paper"
            >
              <Images size={13} aria-hidden />
              Choose from media
            </button>
            <p className="mt-1 font-mono text-[10px] text-paper-50">
              Required to publish; drafts can save without one.
            </p>
          </section>

          {/* Link — the optional outbound link to a workshop page */}
          <section className="card-admin p-3">
            <label
              htmlFor="event-post-link"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Linked workshop (optional)
            </label>
            <select
              id="event-post-link"
              value={linkUrl ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setLinkUrl(value || null);
                // A workshop link is a registration handoff — word the
                // button accordingly unless the admin changes it back.
                if (value) setLinkLabel('Register');
              }}
              className="input-hairline"
            >
              <option value="">No link</option>
              {linkOptions.map((option) => (
                <option key={option.slug} value={`/workshops/${option.slug}`}>
                  {option.name}
                </option>
              ))}
            </select>
            {linkOptionsFailed && (
              <p className="mt-1 font-mono text-[10px] text-vermilion">
                Could not load workshops — the post still saves; link it later.
              </p>
            )}
            {linkUrl && (
              <>
                <label
                  htmlFor="event-post-link-label"
                  className="mb-1.5 mt-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Button wording
                </label>
                <select
                  id="event-post-link-label"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  className="input-hairline"
                >
                  <option value="Register">Register</option>
                  <option value="Learn more">Learn more</option>
                </select>
                <p className="mt-1 font-mono text-[10px] text-paper-50">
                  Sends visitors to {linkUrl} — registration and payment happen there.
                </p>
              </>
            )}
          </section>
        </aside>
      </div>

      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={pickImage} />
    </div>
  );
}

/** ISO datetime → the `datetime-local` input's value (local, minute precision). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
