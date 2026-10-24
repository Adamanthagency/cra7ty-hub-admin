'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
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

/**
 * Categories manager. The six storefront categories are fixed by id (they
 * are the /shop?category=… query values), so this screen only edits name,
 * blurb and editorial order. Reordering renumbers the two-digit `index`
 * that the Categories section prints. Saving writes a single `category`
 * draft holding the whole array; publish applies it via the bar above.
 */
export default function CategoriesPage() {
  const { categories, addDraft } = useContent();

  // working copy seeded from live categories (with current order/index)
  const [rows, setRows] = useState<Category[]>(() =>
    JSON.parse(JSON.stringify(categories)) as Category[]
  );
  const [note, setNote] = useState<string | null>(null);

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

  const patchRow = (id: string, partial: Partial<Category>) => {
    setNote(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const j = index + direction;
    if (j < 0 || j >= rows.length) return;
    setNote(null);
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return renumber(next);
    });
  };

  const save = () => {
    if (!canSave) return;
    addDraft({
      type: 'category',
      key: 'categories',
      label: 'Categories — order and copy',
      before: categories,
      after: rows,
    });
    setNote('Saved to drafts — publish from the bar above.');
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Categories"
        subtitle="Name, blurb and order"
        right={<span className="font-mono text-[11px] text-paper-40">Six storefront categories</span>}
      />

      <p className="mb-4 font-mono text-[10px] leading-relaxed text-paper-40">
        Ids are fixed — they are the /shop?category=… query values. Reordering
        renumbers the two-digit index the home page prints.
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
