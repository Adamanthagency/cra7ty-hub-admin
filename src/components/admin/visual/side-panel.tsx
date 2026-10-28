'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { FieldInput } from '@/components/admin/workbench/field-input';
import { ListEditor } from '@/components/admin/workbench/list-editor';
import { useContent } from '@/components/admin/workbench/content-provider';
import { contentFields, contentLists } from '@/data/mock/content';
import { pages, sectionsForPage } from '@/data/mock/pages';
import { validateField, type FieldSpec } from '@/lib/content-validation';
import type { ContentListItem, PageKey, PageSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { AdminMessage } from '@/lib/visual-bridge';

/* Nouns for the ListEditor "Add …" button — mirrors SectionForm. */
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

export type PanelSelection =
  | { kind: 'none' }
  | { kind: 'field'; key: string }
  | { kind: 'section'; sectionId: string };

interface SidePanelProps {
  pageKey: PageKey;
  /** mobile sheet visibility; the desktop rail is always present */
  open: boolean;
  selection: PanelSelection;
  onSelect: (selection: PanelSelection) => void;
  /** post one validated message to the frame */
  post: (message: AdminMessage) => void;
  onClose: () => void;
}

/**
 * Right-hand panel of the Visual editor.
 *
 * - Nothing selected → page outline: jump to + select, reorder, hide.
 * - A field key came from the frame → that field's FieldInput (same
 *   validation/counter/hints as the form editors). Typing records a
 *   draft AND posts set-field so the frame updates live. List keys
 *   (exact or positional, e.g. `home.faq.items.2.question`) open the
 *   matching ListEditor; every valid change posts set-list.
 * - A section key → section controls (Stage 4 wiring lives in the
 *   visual-editor parent; this panel renders them via `sectionControls`).
 *
 * Everything received from the frame is treated as a plain lookup key —
 * values are rendered from local admin state only, never as HTML.
 */

export function SidePanel({
  pageKey,
  open,
  selection,
  onSelect,
  post,
  onClose,
  sectionControls,
}: SidePanelProps & {
  /** Section controls body, rendered by the parent (Stage 4). */
  sectionControls?: (section: PageSection, onBack: () => void) => React.ReactNode;
}) {
  const {
    draftValue,
    draftList,
    addDraft,
    sections,
    moveSection,
    setSection,
    draftsForPage,
  } = useContent();    // seed order re-sorted by LIVE positions so rows follow Move up/down
    const outline = sectionsForPage(pageKey)
      .map((seed) => sections.find((s) => s.id === seed.id) ?? seed)
      .sort((a, b) => a.position - b.position);

  /* ---------------------------------------------------------------- */
  /* Field / list editing                                              */
  /* ---------------------------------------------------------------- */

  const field =
    selection.kind === 'field'
      ? contentFields.find((f) => f.key === selection.key)
      : undefined;
  const list =
    selection.kind === 'field'
      ? contentLists.find(
          (l) =>
            l.key === selection.key ||
            selection.key.startsWith(`${l.key}.`) ||
            selection.key.startsWith(`${l.key}:`)
        )
      : undefined;

  // For a positional key like home.faq.items.2.question, focus the row.
  const rowMatch =
    selection.kind === 'field' && list
      ? /^([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*?)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(
          selection.key
        )
      : null;
  const focusRow = rowMatch ? Number(rowMatch[2]) : null;

  const [localValue, setLocalValue] = useState('');
  const [localLists, setLocalLists] = useState<Record<string, ContentListItem[]>>({});

  // Reset local editing state whenever the selection changes.
  const selectionKey = selection.kind === 'field' ? selection.key : '';
  useEffect(() => {
    if (!selectionKey) return;
    const f = contentFields.find((x) => x.key === selectionKey);
    if (f) setLocalValue(String(draftValue(f.key) ?? f.value));
    const l = contentLists.find(
      (x) =>
        x.key === selectionKey ||
        selectionKey.startsWith(`${x.key}.`) ||
        selectionKey.startsWith(`${x.key}:`)
    );
    if (l) {
      setLocalLists({
        [l.key]: JSON.parse(
          JSON.stringify(draftList(l.key) ?? l.items)
        ) as ContentListItem[],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // Scroll a focused list row into view inside the panel (ListEditor
  // renders an <ol> of <li> rows in item order).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusRow === null || !list) return;
    const rows = panelRef.current?.querySelectorAll('ol > li');
    const target = rows?.item(focusRow) as HTMLElement | null;
    target?.scrollIntoView({ block: 'center' });
  }, [focusRow, list, selectionKey]);

  const commitField = (raw: string) => {
    if (!field) return;
    setLocalValue(raw);
    const spec: FieldSpec = {
      type: field.type,
      required: field.required,
      maxLength: field.maxLength,
      tokens: field.tokens,
    };
    if (validateField(spec, raw) !== null) return; // no draft, no send while invalid
    const before = String(draftValue(field.key) ?? field.value);
    const after =
      field.type === 'number' && /^\d+$/.test(raw) ? Number(raw) : raw;
    addDraft({
      type: 'field',
      key: field.key,
      label: `${labelFor(field.key, field.label)}`,
      page: field.key.split('.')[0] as PageKey,
      before,
      after,
    });
    // Raw string including {shown}/{total} — tokens are the frame's job.
    post({ source: 'cra7ty', type: 'set-field', payload: { key: field.key, value: raw } });
  };

  const commitList = (listKey: string, items: ContentListItem[]) => {
    const def = contentLists.find((l) => l.key === listKey);
    if (!def) return;
    setLocalLists((prev) => ({ ...prev, [listKey]: items }));
    const invalid = def.itemFields.some((f) => {
      if (f.type === 'flag') return false;
      const spec: FieldSpec = {
        type: f.type,
        required: f.required,
        maxLength: f.maxLength,
        tokens: f.tokens,
      };
      return items.some((item) => {
        const v = item.fields[f.key];
        return validateField(spec, v === undefined ? '' : String(v)) !== null;
      });
    });
    if (invalid) return;
    addDraft({
      type: 'list',
      key: def.key,
      label: `${labelFor(def.key, def.label)}`,
      page: def.key.split('.')[0] as PageKey,
      before: draftList(def.key) ?? def.items,
      after: items,
    });
    post({ source: 'cra7ty', type: 'set-list', payload: { key: def.key, items } });
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const section =
    selection.kind === 'section'
      ? sections.find((s) => s.id === selection.sectionId)
      : undefined;
  const title = field
    ? field.label
    : list
      ? list.label
      : section
        ? section.label
        : 'Page outline';

  return (
    <aside
      ref={panelRef}
      className={cn(
        'flex-col border-l border-line bg-surface md:static md:z-auto md:flex md:w-[360px] md:shrink-0 md:border-l lg:w-[400px]',
        open
          ? 'fixed inset-0 z-40 flex w-full'
          : 'hidden md:flex'
      )}
      aria-label="Visual editor panel"
    >
      {/* header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-paper">{title}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper-40">
            {field || list ? 'Field' : section ? 'Section' : `${outline.length} sections`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-card p-3 text-paper-60 hover:bg-paper-12 hover:text-paper md:p-2"
        >
          <X size={16} />
        </button>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {section && sectionControls ? (
          sectionControls(section, () => onSelect({ kind: 'none' }))
        ) : field ? (
          <FieldInput
            label={field.label}
            type={field.type}
            value={localValue}
            onChange={commitField}
            required={field.required}
            maxLength={field.maxLength}
            tokens={field.tokens}
            showCount
            className="min-h-[44px]"
          />
        ) : list ? (
          <div className="[&_button]:min-h-[44px]">
            <ListEditor
              list={list}
              items={localLists[list.key] ?? []}
              itemNoun={NOUNS[list.key] ?? 'item'}
              onChange={(items) => commitList(list.key, items)}
            />
          </div>
        ) : (
          /* ---------------- page outline ---------------- */
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-paper-40">
              Jump, reorder or hide — the frame follows
            </p>
            <ol className="space-y-2">
              {outline.map((section, index) => {
                const shared = section.sharedFrom !== undefined;
                const pendingVariant = draftsForPage(pageKey).some(
                  (d) => d.type === 'section' && d.key === section.id
                );
                return (
                  <li
                    key={section.id}
                    className={cn(
                      'rounded-card border border-line bg-bg/50 p-3',
                      !section.visible && 'opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-paper-40">
                        {String(section.position).padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          post({
                            source: 'cra7ty',
                            type: 'highlight',
                            payload: { key: section.key },
                          });
                          onSelect({ kind: 'section', sectionId: section.id });
                        }}
                        className="min-h-[44px] min-w-0 flex-1 text-left text-sm text-paper hover:text-vermilion"
                      >
                        <span className="block truncate">{section.label}</span>
                        {shared && (
                          <span className="block font-mono text-[10px] text-kraft-60">
                            Edited on{' '}
                            {pages.find((p) => p.key === section.sharedFrom)?.label}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${section.label} up`}
                        disabled={index === 0}
                        onClick={() => moveSection(section.id, -1)}
                        className="min-h-[44px] min-w-[44px] rounded-card px-2 font-mono text-[11px] text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${section.label} down`}
                        disabled={index === outline.length - 1}
                        onClick={() => moveSection(section.id, 1)}
                        className="min-h-[44px] min-w-[44px] rounded-card px-2 font-mono text-[11px] text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={section.visible}
                        aria-label={`${section.label} visible`}
                        onClick={() =>
                          setSection(section.id, { visible: !section.visible })
                        }
                        className={cn(
                          'min-h-[44px] rounded-card border px-2 font-mono text-[10px] uppercase tracking-[0.1em]',
                          section.visible
                            ? 'border-vermilion bg-vermilion-20 text-vermilion'
                            : 'border-line text-paper-40 hover:text-paper'
                        )}
                      >
                        {section.visible ? 'Shown' : 'Hidden'}
                      </button>
                    </div>
                    {pendingVariant && (
                      <p className="mt-1 font-mono text-[10px] text-kraft-60">
                        Layout change pending
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Human draft label: `Section — field`, falling back to the field name. */
function labelFor(key: string, fallback: string): string {
  const pageKey = key.split('.')[0];
  const known = pages.find((p) => p.key === pageKey);
  if (!known) return fallback;
  const section = sectionsForPage(known.key).find((s) =>
    key.startsWith(`${pageKey}.${s.key}.`)
  );
  return section ? `${section.label} — ${fallback}` : fallback;
}
