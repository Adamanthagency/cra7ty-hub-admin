'use client';

import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { ArrowLeft, ArrowDown, ArrowUp, Eye, EyeOff, MousePointerClick, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { SidePanel } from '@/components/admin/side-panel';
import { pages, sectionsForPage } from '@/data/mock/pages';
import { useContent } from '@/components/admin/workbench/content-provider';
import { SectionForm } from '@/components/admin/workbench/section-form';
import { VariantChips } from '@/components/admin/workbench/variant-chips';
import type { PageSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * One page's ordered section list. Each row: position (mono), label,
 * Move up/down, Show/Hide, Variant chips (only when variants exist) and
 * Edit (opens the section form in a slide-over). Shared sections
 * (bulk, why) render as locked pointer rows — edited on their home page.
 */
export default function PageSectionsPage() {
  const params = useParams<{ page: string }>();
  const page = pages.find((p) => p.key === params.page);
  const { sections, draftsForPage, setSection, moveSection } = useContent();
  const [editing, setEditing] = useState<PageSection | null>(null);

  if (!page) notFound();

  // seed order re-sorted by the LIVE positions moveSection renumbers,
  // so rows actually move when Move up/down is clicked
  const list = sectionsForPage(page.key)
    .map((s) => sections.find((x) => x.id === s.id) ?? s)
    .sort((a, b) => a.position - b.position);
  const pending = draftsForPage(page.key);

  return (
    <div>
      <Link
        href="/admin/pages"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden />
        All pages
      </Link>

      <PageHeader
        title={page.label}
        subtitle={`${list.length} sections${pending.length ? ` · ${pending.length} unpublished` : ''}`}
        right={
          <>
            <span className="font-mono text-[11px] text-paper-40">{page.route}</span>
            <Link
              href={`/admin/pages/${page.key}/visual`}
              className="inline-flex h-9 items-center gap-2 rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper"
            >
              <MousePointerClick size={14} aria-hidden />
              Open visual editor
            </Link>
          </>
        }
      />

      <ul className="space-y-2">
        {list.map((section, index) => {
          const shared = section.sharedFrom !== undefined;
          const dimmed = !section.visible;
          return (
            <li
              key={section.id}
              className={cn(
                'card-admin flex flex-col gap-3 p-3 sm:flex-row sm:items-center',
                dimmed && 'opacity-60'
              )}
            >
              {/* position + label */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="shrink-0 font-mono text-xs tabular-nums text-paper-40">
                  {String(section.position).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-paper">{section.label}</span>
                  {shared && (
                    <span className="font-mono text-[10px] text-kraft-60">
                      Edited on {pages.find((p) => p.key === section.sharedFrom)?.label}
                    </span>
                  )}
                </span>
                {dimmed && (
                  <span className="shrink-0 rounded-card border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-paper-40">
                    Hidden
                  </span>
                )}
              </div>

              {/* variant chips — only where variants exist and not shared */}
              {section.variants && section.variants.length > 0 && !shared && (
                <div className="shrink-0">
                  <VariantChips
                    options={section.variants}
                    value={section.variant}
                    onChange={(v) => setSection(section.id, { variant: v })}
                    label="Layout"
                  />
                </div>
              )}

              {/* controls */}
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move ${section.label} up`}
                  disabled={index === 0}
                  onClick={() => moveSection(section.id, -1)}
                  className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${section.label} down`}
                  disabled={index === list.length - 1}
                  onClick={() => moveSection(section.id, 1)}
                  className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={section.visible}
                  aria-label={`${section.label} visible`}
                  onClick={() => setSection(section.id, { visible: !section.visible })}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-card border px-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors',
                    section.visible
                      ? 'border-vermilion bg-vermilion-20 text-vermilion'
                      : 'border-line text-paper-40 hover:text-paper'
                  )}
                >
                  {section.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  {section.visible ? 'Shown' : 'Hidden'}
                </button>
                <button
                  type="button"
                  disabled={shared}
                  onClick={() => setEditing(section)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-2.5 text-xs text-paper-70 hover:border-paper-40 hover:text-paper disabled:pointer-events-none disabled:opacity-40"
                >
                  <Pencil size={12} />
                  Edit
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <SidePanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={editing?.label ?? ''}
        description={`/${page.route.toLowerCase().replace(/\[slug\]/, '…')}`}
      >
        {editing && (
          <SectionForm
            section={editing}
            page={page.key}
            onClose={() => setEditing(null)}
          />
        )}
      </SidePanel>
    </div>
  );
}
