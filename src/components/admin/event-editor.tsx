'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEvent, updateEvent, type EventSaveInput } from '@/lib/events-api';
import type { EventKind, EventRow, EventStatus } from '@/lib/types';
import { formatNgn } from '@/lib/format';

/**
 * The event editor (Tier 6) — one form component shared by New and
 * Edit, following the settings/products field conventions rather than
 * inventing a new one: card-admin sections, mono labels, a single
 * btn-vermilion save, and a status note under it.
 *
 * Status is an explicit axis with three values (draft / published /
 * cancelled) — CANCEL is a status, never a delete, so an event with
 * registrations keeps its history. The seats/capacity note explains the
 * consequence of setting capacity below what has already been sold,
 * because that is the one edit with a non-obvious outcome (the API
 * answers with `capacityNote`).
 */

const inputCls =
  'mt-1 w-full rounded-card border border-kraft-30/70 bg-paper/[0.03] px-3 py-2 ' +
  'font-mono text-[13px] text-paper outline-none transition-colors ' +
  'focus:border-kraft-30 placeholder:text-paper-30';

const labelCls = 'font-mono text-[11px] text-paper-60';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block font-mono text-[10px] text-paper-40">{hint}</span>}
    </label>
  );
}

/** datetime-local needs "YYYY-MM-DDTHH:MM"; ISO has seconds + Z. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventEditor({ initial }: { initial?: EventRow }) {
  const router = useRouter();
  const editing = Boolean(initial);
  // Under `editing` every use below needs the row; narrowing once keeps
  // the JSX free of `initial?.` noise.
  const current = initial ?? null;

  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? 'workshop');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [price, setPrice] = useState(String(initial?.price ?? ''));
  const [capacity, setCapacity] = useState(
    initial?.capacity === null || initial?.capacity === undefined ? '' : String(initial.capacity),
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  // Status only ever changes through submit(nextStatus), so it is read from
  // the row, not held in state.
  const status: EventStatus = initial?.status ?? 'draft';

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteIsError, setNoteIsError] = useState(false);

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

  const submit = async (nextStatus: EventStatus) => {
    setNote(null);
    if (!name.trim()) {
      setNoteIsError(true);
      setNote('The event needs a name.');
      return;
    }
    const finalSlug = slugTouched && slug.trim() ? slug.trim().toLowerCase() : slugify(name);
    if (!finalSlug) {
      setNoteIsError(true);
      setNote('The event needs a slug — lowercase letters, numbers and dashes.');
      return;
    }

    const priceNumber = price.trim() === '' ? 0 : Number(price);
    if (!Number.isInteger(priceNumber) || priceNumber < 0) {
      setNoteIsError(true);
      setNote('Price must be a whole number of naira — 0 for a free event.');
      return;
    }
    const capacityNumber = capacity.trim() === '' ? null : Number(capacity);
    if (capacityNumber !== null && (!Number.isInteger(capacityNumber) || capacityNumber < 1)) {
      setNoteIsError(true);
      setNote('Capacity must be a whole number above 0 — leave it empty for unlimited.');
      return;
    }
    if (!startsAt) {
      setNoteIsError(true);
      setNote('The event needs a date and time.');
      return;
    }

    const payload: EventSaveInput = {
      slug: finalSlug,
      name: name.trim(),
      description,
      kind,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      location: location.trim() || null,
      price: priceNumber,
      capacity: capacityNumber,
      imageUrl: imageUrl.trim() || null,
      status: nextStatus,
    };

    setBusy(true);
    try {
      const result = editing && current
        ? await updateEvent(current.id, payload)
        : await createEvent(payload);
      setNoteIsError(false);
      setNote(
        result.revalidate && !result.revalidate.ok
          ? 'Saved — but the storefront refresh failed, so the public page may take up to five minutes to catch up.'
          : nextStatus === 'published'
            ? 'Published. The event page is live.'
            : 'Saved.',
      );
      if (result.capacityNote) {
        setNoteIsError(true);
        setNote(result.capacityNote);
      }
      if (!editing) {
        router.push(`/admin/events/${result.id}`);
      }
    } catch (error) {
      setNoteIsError(true);
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card-admin space-y-4 p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper-40">
          The event
        </h2>
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Saturday folding table"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug" hint="The page address: /workshops/your-slug">
            <input
              className={inputCls}
              value={slug}
              maxLength={80}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="saturday-folding-table"
            />
          </Field>
          <Field label="Kind">
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as EventKind)}
            >
              <option value="workshop">Workshop</option>
              <option value="exhibition">Exhibition</option>
            </select>
          </Field>
        </div>
        <Field label="Description" hint="Plain paragraphs — a blank line makes a new one.">
          <textarea
            className={`${inputCls} min-h-[9rem] resize-y`}
            value={description}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Three hours at the folding table. Every crease taught by hand; materials included."
          />
        </Field>
      </section>

      <section className="card-admin space-y-4 p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper-40">
          When and where
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <input
              type="datetime-local"
              className={inputCls}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Ends" hint="Optional">
            <input
              type="datetime-local"
              className={inputCls}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Location"
          hint="Leave empty to use the studio address from site settings."
        >
          <input
            className={inputCls}
            value={location}
            maxLength={300}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="(studio address)"
          />
        </Field>
      </section>

      <section className="card-admin space-y-4 p-5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper-40">
          Price and capacity
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price (₦)"
            hint={price.trim() !== '' && Number(price) === 0 ? 'Free event — no payment, confirmed on the spot.' : 'Whole naira.'}
          >
            <input
              className={inputCls}
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </Field>
          <Field
            label="Capacity"
            hint="Empty = unlimited seats. A capped event opens a waitlist when full."
          >
            <input
              className={inputCls}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="(unlimited)"
            />
          </Field>
        </div>
        {editing && current && (
          <p className="font-mono text-[11px] text-paper-40">
            {current.seatsTaken} of {current.capacity} seats confirmed
            {current.pendingCount > 0 ? ` · ${current.pendingCount} payment(s) pending` : ''}
          </p>
        )}
        <Field label="Image URL" hint="Shown on the workshops list. Optional.">
          <input
            className={inputCls}
            value={imageUrl}
            maxLength={500}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => submit(status === 'cancelled' ? 'draft' : status)}
          disabled={busy}
          className="btn-vermilion"
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create as draft'}
        </button>
        {status !== 'published' && status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => submit('published')}
            disabled={busy}
            className="rounded-card border border-kraft-30 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper hover:border-kraft-60"
          >
            Publish now
          </button>
        )}
        {editing && status === 'published' && (
          <button
            type="button"
            onClick={() => submit('draft')}
            disabled={busy}
            className="rounded-card border border-kraft-30 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper hover:border-kraft-60"
          >
            Unpublish (back to draft)
          </button>
        )}
        {editing && status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => submit('cancelled')}
            disabled={busy}
            className="rounded-card border border-vermilion/40 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-vermilion hover:border-vermilion"
          >
            Cancel event
          </button>
        )}
        {editing && status === 'cancelled' && (
          <span className="font-mono text-[11px] text-vermilion">
            Cancelled — hidden from the storefront. Registrations are kept.
          </span>
        )}
        {editing && current && (
          <a
            href={`/workshops/${current.slug}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-paper-60 underline-offset-4 hover:text-paper hover:underline"
          >
            View public page ↗
          </a>
        )}
      </div>

      {note && (
        <p
          role={noteIsError ? 'alert' : 'status'}
          className={`font-mono text-[11px] leading-snug ${noteIsError ? 'text-vermilion' : 'text-moss-bright'}`}
        >
          {note}
        </p>
      )}

      {editing && current && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
          Entry {formatNgn(current.price)} · {current.kind} · created{' '}
          {new Date(current.createdAt).toLocaleDateString('en-NG')}
        </p>
      )}
    </div>
  );
}
