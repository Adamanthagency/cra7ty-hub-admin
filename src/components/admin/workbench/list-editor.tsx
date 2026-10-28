'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { ContentList, ContentListItem } from '@/lib/types';
import { validateField, type FieldSpec } from '@/lib/content-validation';
import { ConfirmDialog } from './confirm-dialog';
import { FieldInput } from './field-input';
import { cn } from '@/lib/utils';

interface ListEditorProps {
  list: ContentList;
  /** draft-aware items */
  items: ContentListItem[];
  onChange: (items: ContentListItem[]) => void;
  /** shown when the list is empty or being added to, e.g. "FAQ question" */
  itemNoun: string;
}

let uid = 0;
const newId = () => `item-${Date.now()}-${++uid}`;

/**
 * Repeating content editor: FAQ items, testimonials, marquee words,
 * stations, nav/footer links, bulk events and tiers. Add, remove (with
 * a confirm naming the item), move up/down — never drag. Fixed lists
 * (statuses, sort options, computed labels) edit fields only.
 */
export function ListEditor({ list, items, onChange, itemNoun }: ListEditorProps) {
  const [removing, setRemoving] = useState<ContentListItem | null>(null);
  const fixed = list.fixed === true;
  const atCap =
    list.maxItems !== undefined && items.length >= list.maxItems;

  const patch = (id: string, key: string, value: string | number | boolean) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, fields: { ...item.fields, [key]: value } } : item
      )
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const j = index + direction;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j]!, next[index]!];
    onChange(next);
  };

  const add = () => {
    const fields: Record<string, string | number | boolean> = {};
    for (const f of list.itemFields) {
      fields[f.key] = f.type === 'flag' ? false : f.type === 'number' ? 0 : '';
    }
    onChange([...items, { id: newId(), fields }]);
  };

  const remove = (item: ContentListItem) => {
    onChange(items.filter((i) => i.id !== item.id));
    setRemoving(null);
  };

  /** a human name for the confirm dialog: first non-empty text field */
  const nameOf = (item: ContentListItem) => {
    for (const f of list.itemFields) {
      if (f.type === 'flag') continue;
      const v = item.fields[f.key];
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 60);
    }
    return 'this item';
  };

  return (
    <div className="rounded-card border border-line bg-bg/50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
          {list.label}
        </span>
        <span className="font-mono text-[11px] text-paper-40">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <ol className="space-y-3">
        {items.map((item, index) => {
          const invalid = list.itemFields.filter((f) => {
            if (f.type === 'flag') return false;
            const spec: FieldSpec = {
              type: f.type,
              required: f.required,
              maxLength: f.maxLength,
              tokens: f.tokens,
            };
            const raw = item.fields[f.key];
            return validateField(spec, raw === undefined ? '' : String(raw)) !== null;
          });

          return (
            <li key={item.id} className="rounded-card border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] tabular-nums text-paper-40">
                  {String(index + 1).padStart(2, '0')}
                  {invalid.length > 0 && (
                    <span className="ml-2 text-vermilion">
                      {invalid.length} to fix
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {!fixed && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${nameOf(item)} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${nameOf(item)} down`}
                        disabled={index === items.length - 1}
                        onClick={() => move(index, 1)}
                        className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${nameOf(item)}`}
                        onClick={() => setRemoving(item)}
                        className="rounded-card p-2 text-paper-40 hover:text-vermilion"
                      >
                        <X size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {list.itemFields.map((f) =>
                  f.type === 'flag' ? (
                    <div key={f.key} className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                        {f.label}
                      </span>
                      <Toggle
                        checked={item.fields[f.key] === true}
                        onChange={(v) => patch(item.id, f.key, v)}
                        label={f.label}
                      />
                    </div>
                  ) : (
                    <FieldInput
                      key={f.key}
                      label={f.label}
                      type={f.type}
                      value={item.fields[f.key] === undefined ? '' : (item.fields[f.key] as string | number)}
                      onChange={(v) =>
                        patch(item.id, f.key, f.type === 'number' && /^\d+$/.test(v) ? Number(v) : v)
                      }
                      required={f.required}
                      maxLength={f.maxLength}
                      tokens={f.tokens}
                    />
                  )
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {items.length === 0 && (
        <p className="rounded-card border border-dashed border-line p-4 text-center font-mono text-xs text-paper-60">
          No {list.label.toLowerCase()} yet.
        </p>
      )}

      {!fixed &&
        (atCap ? (
          <p className="mt-3 font-mono text-[10px] text-paper-40">
            {list.maxItems} {itemNoun}
            {list.maxItems === 1 ? '' : 's'} maximum — remove one before
            adding another.
          </p>
        ) : (
          <button
            type="button"
            onClick={add}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper"
          >
            <Plus size={14} aria-hidden />
            Add {itemNoun}
          </button>
        ))}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove “${removing ? nameOf(removing) : ''}”?`}
        body={`This removes it from ${list.label.toLowerCase()}. Publish to apply the removal.`}
        confirmLabel="Remove"
        onConfirm={() => removing && remove(removing)}
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors',
        checked ? 'border-kraft bg-kraft-12' : 'border-line bg-bg'
      )}
    >
      <span
        className={cn(
          'h-3.5 w-3.5 rounded-full transition-transform',
          checked ? 'translate-x-4 bg-kraft' : 'translate-x-0 bg-paper-40'
        )}
      />
    </button>
  );
}
