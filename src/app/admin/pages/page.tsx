'use client';

import Link from 'next/link';
import { ArrowRight, FileStack, MousePointerClick } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { pages } from '@/data/mock/pages';
import { contentFields, contentLists } from '@/data/mock/content';
import { useContent } from '@/components/admin/workbench/content-provider';
import { sectionsForPage } from '@/data/mock/pages';
import type { PageKey } from '@/lib/types';

export default function PagesIndexPage() {
  const { draftsForPage } = useContent();

  const fieldsFor = (key: PageKey) =>
    contentFields.filter((f) => f.key.startsWith(`${key}.`)).length;
  const listsFor = (key: PageKey) =>
    contentLists.filter((l) => l.key.startsWith(`${key}.`)).length;

  return (
    <div>
      <PageHeader
        title="Pages"
        subtitle={`${pages.length} editable`}
        right={
          <span className="font-mono text-[11px] text-paper-60">
            Sections, text and layout
          </span>
        }
      />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {pages.map((page) => {
          const sections = sectionsForPage(page.key);
          const pending = draftsForPage(page.key).length;
          const fieldCount = fieldsFor(page.key) + listsFor(page.key);

          return (
            <li key={page.key} className="card-admin group relative flex h-full flex-col p-4 transition-colors hover:border-paper-40">
              <Link
                href={`/admin/pages/${page.key}`}
                className="after:absolute after:inset-0 after:content-['']"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <FileStack size={16} aria-hidden className="text-kraft-60" />
                    <span className="font-display text-lg text-paper">{page.label}</span>
                  </span>
                  <ArrowRight
                    size={14}
                    aria-hidden
                    className="mt-1 text-paper-40 transition-colors group-hover:text-paper"
                  />
                </div>

                <p className="mt-1 font-mono text-[11px] text-paper-40">{page.route}</p>

                <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-paper-60">
                  <div className="flex items-baseline gap-1.5">
                    <dt>Sections</dt>
                    <dd className="tabular-nums text-paper">{sections.length}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt>Fields</dt>
                    <dd className="tabular-nums text-paper">{fieldCount}</dd>
                  </div>
                </dl>

                {pending > 0 ? (
                  <p className="mt-3 inline-flex items-center gap-2 self-start rounded-card border border-vermilion/40 bg-vermilion-20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-vermilion">
                    {pending} unpublished change{pending === 1 ? '' : 's'}
                  </p>
                ) : (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-paper-40">
                    Published
                  </p>
                )}
              </Link>

              <Link
                href={`/admin/pages/${page.key}/visual`}
                className="relative z-10 mt-3 inline-flex h-9 items-center gap-2 self-start rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper"
              >
                <MousePointerClick size={14} aria-hidden />
                Open visual editor
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
