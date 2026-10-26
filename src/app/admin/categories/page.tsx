'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { FieldInput } from '@/components/admin/workbench/field-input';
import { useContent } from '@/components/admin/workbench/content-provider';
import type { Category } from '@/lib/types';

/** Two-digit editorial number: 1 → "01". */
const renumber = (list: Category[]): Category[] =>
  list.map((c, i) => ({ ...c, index: String(i + 1).padStart(2, '0') }));

/** Clone + strip derived index — the comparison key for "did anything change". */
const bodyOf = (list: Category[]): string =>
  JSON.stringify(list.map((c) => ({ id: c.id, name: c.name, blurb: c.blurb })));

/** Same slug rule the publish route enforces — it IS the /shop?category=… value. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Categories manager. Each row's id is its /shop?category=… query value:
 * existing ids stay stable, and rows can be added (new slug) or removed —
 * publish syncs the whole array. Reordering renumbers the two-digit
 * `index` the Categories section prints. Saving writes a single `category`
 * draft holding the whole array; publish applies it via the bar above.
 *
 * At least one row always stays: the home page's Categories section
 * dereferences categories[0], so an empty list would crash it.
 */
export default function CategoriesPage() {
  const { categories, addDraft } = useContent();

  // working copy seeded from live categories (with current order/index)
  const [rows, setRows] = useState<Category[]>(() =>
    JSON.parse(JSON.stringify(categories)) as Category[]
  );
  const [note, setNote] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  // True once the admin touches a row. Comparing rows against live to
  // decide whether to adopt live data fails as soon as the two differ for
  // ANY reason — including the initial seed → live hydration when the
  // published set has drifted from the mock seed (a 7th category) — which
  // would freeze the list on stale rows forever.
  const [dirty, setDirty] = useState(false);

  const hasChanges = useMemo(
    () => bodyOf(rows) !== bodyOf(categories) ||
      rows.some((r, i) => r.index !== categories[i]?.index),
    [rows, categories]
  );

  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (!row.name.trim()) map[`${row.id}:name`] = 'This cannot be saved empty.';
      if (!row.blurb.trim()) map[`${row.id}:blurb`] = 'This cannot be saved empty.';
    }
    return map;
  }, [rows]);

  const canSave = hasChanges && Object.keys(errors).length === 0;

  // Hydration replaces the seed after mount — adopt the live rows until the
  // admin has actually started editing, so the form never sits on stale copy.
  useEffect(() => {
    if (!dirty) {
      setRows(JSON.parse(JSON.stringify(categories)) as Category[]);
    }
  }, [categories, dirty]);

  const patchRow = (id: string, partial: Partial<Category>) => {
    setNote(null);
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const j = index + direction;
    if (j < 0 || j >= rows.length) return;
    setNote(null);
    setDirty(true);
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return renumber(next);
    });
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return; // never empty the list
    setNote(null);
    setDirty(true);
    setRows((prev) => renumber(prev.filter((r) => r.id !== id)));
  };

  // Live validation for the add form.
  const trimmedId = newId.trim();
  const idError = !trimmedId
    ? null
    : !SLUG.test(trimmedId)
      ? 'Use lowercase letters, digits and dashes — it becomes /shop?category=…'
      : rows.some((r) => r.id === trimmedId)
        ? 'That id already exists.'
        : null;

  const addRow = () => {
    if (!trimmedId || idError) return;
    setNote(null);
    setNewId('');
    setDirty(true);
    setRows((prev) =>
      renumber([...prev, { id: trimmedId, index: '', name: '', blurb: '' }])
    );
  };

  const save = () => {
    if (!canSave) return;
    addDraft({
      type: 'category',
      key: 'categories',
      label: 'Categories — rows and copy',
      before: categories,
      after: rows,
    });
    setNote('Saved to drafts — publish from the bar above.');
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Categories"
        subtitle="Rows, name, blurb and order"
        right={
          <span className="font-mono text-[11px] text-paper-40">
            {rows.length} {rows.length === 1 ? 'category' : 'categories'}
          </span>
        }
      />

      <p className="mb-4 font-mono text-[10px] leading-relaxed text-paper-40">
        Each id is the /shop?category=… query value — it locks once published.
        Reordering renumbers the two-digit index the home page prints. New
        categories get the crane art on the home page.
      </p>

      <ul className="space-y-3">
        {rows.map((row, index) => {
          const nameError = errors[`${row.id}:name`];
          const blurbError = errors[`${row.id}:blurb`];
          return (
            <li key={row.id} className="card-admin p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-vermilion">
                  {row.index}
                </span>
                <span className="font-mono text-[10px] text-paper-40">{row.id}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${row.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row.name} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${row.id} category`}
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(row.id)}
                    className="rounded-card p-2 text-paper-60 hover:bg-vermilion-20 hover:text-vermilion disabled:pointer-events-none disabled:opacity-30"
                    title={
                      rows.length <= 1
                        ? 'The home page needs at least one category.'
                        : 'Remove this category (undo by discarding the draft)'
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <FieldInput
                  label="Name"
                  type="text"
                  value={row.name}
                  maxLength={32}
                  onChange={(v) => patchRow(row.id, { name: v })}
                />
                {nameError && (
                  <p role="alert" className="font-mono text-[11px] text-vermilion">
                    {nameError}
                  </p>
                )}
                <FieldInput
                  label="Blurb"
                  type="longtext"
                  value={row.blurb}
                  maxLength={120}
                  onChange={(v) => patchRow(row.id, { blurb: v })}
                />
                {blurbError && (
                  <p role="alert" className="font-mono text-[11px] text-vermilion">
                    {blurbError}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* add a new category row */}
      <div className="card-admin mt-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              New id (slug)
            </span>
            <input
              type="text"
              value={newId}
              maxLength={48}
              placeholder="e.g. wedding-favours"
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRow();
                }
              }}
              className="w-full rounded-card border border-line bg-paper-02 px-3 py-2 font-mono text-xs text-paper placeholder:text-paper-30 focus:border-vermilion focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={addRow}
            disabled={!trimmedId || Boolean(idError)}
            className="inline-flex h-9 items-center gap-1.5 rounded-card border border-line px-3 text-xs text-paper-70 hover:border-paper-40 hover:text-paper disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus size={13} />
            Add category
          </button>
        </div>
        {idError && (
          <p role="alert" className="mt-2 font-mono text-[11px] text-vermilion">
            {idError}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={save} disabled={!canSave} className="btn-vermilion">
          Save to drafts
        </button>
        {Object.keys(errors).length > 0 && (
          <p className="font-mono text-[11px] text-vermilion">
            Fill the empty fields above first.
          </p>
        )}
        {note && (
          <p role="status" className="font-mono text-[11px] leading-snug text-moss-bright">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
