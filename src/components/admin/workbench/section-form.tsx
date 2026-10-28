'use client';

import { useState } from 'react';
import type { ContentListItem, PageKey, PageSection } from '@/lib/types';
import { contentFields, contentLists } from '@/data/mock/content';
import { validateField, type FieldSpec } from '@/lib/content-validation';
import { useContent } from './content-provider';
import { FieldInput } from './field-input';
import { ListEditor } from './list-editor';
import { VariantChips } from './variant-chips';

/** plural noun per list key, for the "Add …" button */
const NOUNS: Record<string, string> = {
  'global.navigation.links': 'link',
  'global.footer.shop-links': 'link',
  'global.footer.orders-links': 'link',
  'global.footer.studio-links': 'link',
  'global.footer.columns': 'column',
  'home.hero.stats': 'stat',
  'home.hero.slideshow': 'slide',
  'home.hero.marquee.words': 'word',
  'home.marquee.words': 'word',
  'home.process.steps': 'step',
  'home.process.fold-steps': 'caption',
  'home.bulk.events': 'row',
  'home.bulk.tiers': 'tier',
  'home.why.points': 'point',
  'home.testimonials.items': 'testimonial',
  'home.faq.items': 'question',
  'shop.shelf.sort-options': 'option',
  'blog.closing.marquee.words': 'word',
  'about.hero.marquee.words': 'word',
  'about.sheet.stations': 'station',
  'about.numbers.facts': 'fact',
  'about.facts.rows': 'row',
  'tracker.statuses': 'status',
};

interface SectionFormProps {
  section: PageSection;
  page: PageKey;
  onClose: () => void;
}

/**
 * The slide-over body for editing one section: every scalar content
 * field under the section's key prefix, plus the variant chips when the
 * section declares variants. Save is disabled while any field is
 * invalid; saving records drafts (one per changed key), never live data.
 */
export function SectionForm({ section, page, onClose }: SectionFormProps) {
  const { draftValue, draftList, addDraft } = useContent();

  const fields = contentFields.filter((f) =>
    f.key.startsWith(`${page}.${section.key}.`)
  );
  const lists = contentLists.filter(
    (l) =>
      l.key.startsWith(`${page}.${section.key}.`) ||
      l.key === `${page}.${section.key}`
  );

  const [local, setLocal] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, String(draftValue(f.key) ?? f.value)]))
  );
  const [localLists, setLocalLists] = useState<Record<string, ContentListItem[]>>(() =>
    Object.fromEntries(
      lists.map((l) => [l.key, JSON.parse(JSON.stringify(draftList(l.key) ?? l.items))])
    )
  );
  const [variant, setVariant] = useState<string | undefined>(section.variant);
  const [saved, setSaved] = useState(false);

  const errors = fields.filter((f) => {
    const spec: FieldSpec = {
      type: f.type,
      required: f.required,
      maxLength: f.maxLength,
      tokens: f.tokens,
    };
    return validateField(spec, local[f.key] ?? '') !== null;
  });

  const changed = fields.filter((f) => {
    const original = String(draftValue(f.key) ?? f.value);
    return (local[f.key] ?? '') !== original;
  });

  const changedLists = lists.filter(
    (l) =>
      JSON.stringify(localLists[l.key]) !==
      JSON.stringify(draftList(l.key) ?? l.items)
  );

  const listHasErrors = changedLists.some((l) =>
    (localLists[l.key] ?? []).some((item) =>
      l.itemFields.some((f) => {
        if (f.type === 'flag') return false;
        const spec: FieldSpec = {
          type: f.type,
          required: f.required,
          maxLength: f.maxLength,
          tokens: f.tokens,
        };
        const raw = item.fields[f.key];
        return validateField(spec, raw === undefined ? '' : String(raw)) !== null;
      })
    )
  );

  const canSave =
    errors.length === 0 &&
    !listHasErrors &&
    (changed.length > 0 || changedLists.length > 0 || variant !== section.variant);

  const save = () => {
    if (!canSave) return;
    for (const f of changed) {
      const before = String(draftValue(f.key) ?? f.value);
      const raw = local[f.key] ?? '';
      addDraft({
        type: 'field',
        key: f.key,
        label: `${section.label} — ${f.label}`,
        page,
        before,
        // numbers stay numbers so the diff and publish path round-trip
        after: f.type === 'number' && /^\d+$/.test(raw) ? Number(raw) : raw,
      });
    }
    for (const l of changedLists) {
      addDraft({
        type: 'list',
        key: l.key,
        label: `${section.label} — ${l.label}`,
        page,
        before: draftList(l.key) ?? l.items,
        after: localLists[l.key],
      });
    }
    if (variant !== section.variant) {
      addDraft({
        type: 'section',
        key: section.id,
        label: `${section.label} — layout`,
        page,
        before: { variant: section.variant },
        // only the changed field — a full snapshot would clobber live
        // visible/position wherever this draft is overlaid
        after: { variant },
      });
    }
    setSaved(true);
    window.setTimeout(onClose, 400);
  };

  return (
    <div className="space-y-4">
      {fields.length === 0 && lists.length === 0 && (
        <p className="rounded-card border border-dashed border-line p-4 text-center font-mono text-xs text-paper-60">
          This section has no editable copy — it renders products, categories
          or settings values.
        </p>
      )}

      {fields.map((f) => (
        <FieldInput
          key={f.key}
          label={f.label}
          type={f.type}
          value={local[f.key] ?? ''}
          onChange={(v) => {
            setSaved(false);
            setLocal((prev) => ({ ...prev, [f.key]: v }));
          }}
          required={f.required}
          maxLength={f.maxLength}
          tokens={f.tokens}
        />
      ))}

      {lists.map((l) => (
        <ListEditor
          key={l.key}
          list={l}
          items={localLists[l.key] ?? []}
          itemNoun={NOUNS[l.key] ?? 'item'}
          onChange={(items) => {
            setSaved(false);
            setLocalLists((prev) => ({ ...prev, [l.key]: items }));
          }}
        />
      ))}

      {section.variants && section.variants.length > 0 && (
        <VariantChips
          options={section.variants}
          value={variant}
          onChange={(v) => {
            setSaved(false);
            setVariant(v);
          }}
        />
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={save} disabled={!canSave} className="btn-vermilion">
          Save changes
        </button>
        {listHasErrors && (
          <p className="font-mono text-[11px] text-vermilion">
            Fix the list items marked above first.
          </p>
        )}
        {errors.length === 0 && !listHasErrors && !canSave && !saved && (
          <p className="font-mono text-[11px] text-paper-40">Nothing changed yet.</p>
        )}
        {saved && (
          <p role="status" className="font-mono text-[11px] text-moss-bright">
            Saved to drafts — publish from the bar above.
          </p>
        )}
      </div>
    </div>
  );
}
