'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil } from 'lucide-react';
import { useContent } from '@/components/admin/workbench/content-provider';
import { SectionForm } from '@/components/admin/workbench/section-form';
import { VariantChips } from '@/components/admin/workbench/variant-chips';
import { pages, sectionsForPage } from '@/data/mock/pages';
import type { PageKey, PageSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { AdminMessage } from '@/lib/visual-bridge';

interface SectionControlsProps {
  section: PageSection;
  pageKey: PageKey;
  post: (message: AdminMessage) => void;
  onBack: () => void;
}

/**
 * The `select-section` body of the side panel: Move up / Move down,
 * Show or Hide, Variant chips (only where the section declares
 * variants), and "Edit all fields in this section" which opens the
 * existing SectionForm inline.
 *
 * Moves and visibility use the same ContentProvider mutators as the
 * form-based sections screen (live mock state, exactly as there);
 * variant changes record a `section` draft like SectionForm does. The
 * parent's section-signature effect broadcasts set-sections to the
 * frame after every one of these changes — the frame reorders, hides
 * and re-variants live.
 *
 * Shared sections (bulk, why) show the existing "edited on Home"
 * pointer and cannot edit fields here, matching the sections screen.
 */
export function SectionControls({
  section,
  pageKey,
  post,
  onBack,
}: SectionControlsProps) {
  const { sections, moveSection, setSection, addDraft, drafts } = useContent();
  const [editingAll, setEditingAll] = useState(false);

  // Live section with any pending variant draft overlaid.
  const live = sections.find((s) => s.id === section.id) ?? section;
  const pendingVariant = drafts.find(
    (d) => d.type === 'section' && d.key === section.id
  );
  const current = pendingVariant
    ? { ...live, ...(pendingVariant.after as Partial<PageSection>) }
    : live;

  const shared = current.sharedFrom !== undefined;    const siblings = sectionsForPage(pageKey)
      .map((seed) => sections.find((s) => s.id === seed.id) ?? seed)
      .sort((a, b) => a.position - b.position);
  const index = siblings.findIndex((s) => s.id === current.id);

  const hasVariants =
    !shared && current.variants !== undefined && current.variants.length > 0;

  const chooseVariant = (variant: string) => {
    if (variant === current.variant) return;
    addDraft({
      type: 'section',
      key: current.id,
      label: `${current.label} — layout`,
      page: pageKey,
      before: { variant: current.variant },
      // only what changed: a full snapshot would carry a stale
      // visible/position into every payload overlay and clobber the
      // live values set after the draft was created
      after: { variant },
    });
    post({ source: 'cra7ty', type: 'set-sections', payload: sectionsNow() });
  };

  /** Fresh payload for an immediate broadcast (the signature effect in
   *  the parent covers this too; posting directly keeps the send next
   *  to the click that caused it). */
  const sectionsNow = () => {
    const list = siblings; // already live + position-ordered
    return {
      page: pageKey,
      order: list.map((s) => s.key),
      hidden: list.filter((s) => !s.visible).map((s) => s.key),
      variants: Object.fromEntries(
        list
          .filter((s) => s.variant !== undefined)
          .map((s) => [s.key, s.variant as string])
      ),
    };
  };

  if (editingAll) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setEditingAll(false)}
          className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
        >
          ← Section controls
        </button>
        <SectionForm
          section={current}
          page={pageKey}
          onClose={() => setEditingAll(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        ← Page outline
      </button>

      <div className="rounded-card border border-line bg-bg/50 p-3">
        <p className="text-sm text-paper">{current.label}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-paper-40">
          {current.key}
          {!current.visible && ' · hidden'}
        </p>
        {shared && (
          <p className="mt-2 font-mono text-[11px] text-kraft-60">
            Edited on{' '}
            {pages.find((p) => p.key === current.sharedFrom)?.label}
          </p>
        )}
      </div>

      {/* move + visibility — same mutators as the sections screen */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={`Move ${current.label} up`}
          disabled={index <= 0}
          onClick={() => {
            moveSection(current.id, -1);
            post({ source: 'cra7ty', type: 'set-sections', payload: sectionsNow() });
          }}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowUp size={14} aria-hidden />
          Move up
        </button>
        <button
          type="button"
          aria-label={`Move ${current.label} down`}
          disabled={index < 0 || index >= siblings.length - 1}
          onClick={() => {
            moveSection(current.id, 1);
            post({ source: 'cra7ty', type: 'set-sections', payload: sectionsNow() });
          }}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowDown size={14} aria-hidden />
          Move down
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={current.visible}
          aria-label={`${current.label} visible`}
          onClick={() => {
            setSection(current.id, { visible: !current.visible });
            post({ source: 'cra7ty', type: 'set-sections', payload: sectionsNow() });
          }}
          className={cn(
            'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-card border px-3 font-mono text-[11px] uppercase tracking-[0.1em]',
            current.visible
              ? 'border-vermilion bg-vermilion-20 text-vermilion'
              : 'border-line text-paper-40 hover:text-paper'
          )}
        >
          {current.visible ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
          {current.visible ? 'Shown' : 'Hidden'}
        </button>
      </div>

      {hasVariants && (
        <VariantChips
          options={current.variants as string[]}
          value={current.variant}
          onChange={chooseVariant}
          label="Layout"
        />
      )}

      <button
        type="button"
        disabled={shared}
        onClick={() => setEditingAll(true)}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper disabled:pointer-events-none disabled:opacity-40"
      >
        <Pencil size={14} aria-hidden />
        Edit all fields in this section
      </button>

      {shared && (
        <p className="font-mono text-[11px] leading-snug text-paper-40">
          This section is edited on{' '}
          {pages.find((p) => p.key === current.sharedFrom)?.label} — field
          editing stays there.
        </p>
      )}
    </div>
  );
}
