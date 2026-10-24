'use client';

import { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { ConfirmDialog } from '@/components/admin/workbench/confirm-dialog';
import { useContent } from '@/components/admin/workbench/content-provider';
import { formatDateTime } from '@/lib/format';
import type { Revision } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * History: every published revision, newest first. Expand one to read its
 * diff (from → to per changed key); Restore rolls the live state back to
 * this revision's pre-change values and records the reversal as a new
 * revision. Local mock only — nothing leaves the browser.
 */
export default function HistoryPage() {
  const { revisions, restoreRevision } = useContent();
  const [expanded, setExpanded] = useState<string | null>(revisions[0]?.id ?? null);
  const [confirming, setConfirming] = useState<Revision | null>(null);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="History"
        subtitle={`${revisions.length} revision${revisions.length === 1 ? '' : 's'}`}
        right={<span className="font-mono text-[11px] text-paper-40">Newest first</span>}
      />

      {revisions.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-8 text-center font-mono text-xs text-paper-60">
          No revisions yet — publish a change from any editing screen and it lands here.
        </p>
      ) : (
        <ul className="relative space-y-2 border-l border-line pl-5">
          {revisions.map((rev) => {
            const open = expanded === rev.id;
            return (
              <li key={rev.id} className="relative">
                {/* timeline node */}
                <span
                  aria-hidden
                  className="absolute -left-[26px] top-4 h-2 w-2 rounded-full bg-vermilion"
                />
                <div
                  className={cn(
                    'card-admin overflow-hidden transition-colors',
                    open && 'border-paper-15'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : rev.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
                    <ChevronDown
                      size={14}
                      className={cn(
                        'shrink-0 text-paper-40 transition-transform',
                        open && 'rotate-180'
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-paper">
                        {rev.changes.length} change{rev.changes.length === 1 ? '' : 's'}
                      </span>
                      <span className="font-mono text-[11px] text-paper-60">
                        {formatDateTime(rev.at)} · {rev.author}
                      </span>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirming(rev);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirming(rev);
                        }
                      }}
                      className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[10px] text-paper-70 hover:border-paper-40 hover:text-paper"
                    >
                      <RotateCcw size={12} />
                      Restore
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-line">
                      <table className="w-full table-fixed border-collapse text-left">
                        <thead>
                          <tr className="border-b border-line font-mono text-[9px] uppercase tracking-[0.16em] text-paper-40">
                            <th className="w-[30%] px-3 py-2 font-normal">Field</th>
                            <th className="w-[35%] px-3 py-2 font-normal">Before</th>
                            <th className="px-3 py-2 font-normal">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rev.changes.map((c, i) => (
                            <tr key={`${c.key}-${i}`} className="border-b border-line/60 align-top last:border-0">
                              <td className="px-3 py-2 text-xs text-paper">{c.label}</td>
                              <td className="break-words px-3 py-2 font-mono text-[11px] leading-snug text-kraft">
                                {c.from || '—'}
                              </td>
                              <td className="break-words px-3 py-2 font-mono text-[11px] leading-snug text-moss-bright">
                                {c.to || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Restore this revision?"
        body={`The ${confirming?.changes.length ?? 0} field${confirming?.changes.length === 1 ? '' : 's'} changed in this revision will roll back to their values before it. The reversal is recorded as a new revision. Mock only — nothing is sent to a backend.`}
        confirmLabel="Restore"
        onConfirm={() => {
          if (confirming) restoreRevision(confirming);
          setConfirming(null);
        }}
      />
    </div>
  );
}
