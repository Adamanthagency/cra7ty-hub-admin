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
 * History: every published revision from Supabase, newest first. Expand
 * one to read its diff (from → to per changed key); Restore republishes
 * this revision's pre-change values through the same publish transaction
 * and records the reversal as a new revision. Field, list and settings
 * changes restore; section moves are display-only in the diff and stay
 * as they are.
 */
export default function HistoryPage() {
  const { revisions, restoreRevision, liveStatus, liveError } = useContent();
  const [expanded, setExpanded] = useState<string | null>(revisions[0]?.id ?? null);
  const [confirming, setConfirming] = useState<Revision | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const runRestore = async (rev: Revision) => {
    setBusy(true);
    try {
      await restoreRevision(rev);
      setNote({
        tone: 'ok',
        text: 'Restored — the previous values are live again and the reversal is recorded as a new revision.',
      });
    } catch (error) {
      setNote({
        tone: 'error',
        text: `Restore failed: ${(error as Error).message}. Nothing was changed.`,
      });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="History"
        subtitle={`${revisions.length} revision${revisions.length === 1 ? '' : 's'}`}
        right={
          <span
            title={liveError ?? undefined}
            className={cn(
              'font-mono text-[11px]',
              liveStatus === 'live' ? 'text-moss-bright' : 'text-paper-40'
            )}
          >
            {liveStatus === 'loading'
              ? 'Connecting…'
              : liveStatus === 'live'
                ? 'Live from Supabase · newest first'
                : 'Not connected — showing local seed'}
          </span>
        }
      />

      {note && (
        <p
          role="status"
          className={cn(
            'mb-4 rounded-card border px-3 py-2 font-mono text-[11px]',
            note.tone === 'error'
              ? 'border-vermilion/40 bg-vermilion-20 text-vermilion'
              : 'border-line bg-surface text-moss-bright'
          )}
        >
          {note.text}
        </p>
      )}

      {revisions.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-8 text-center font-mono text-xs text-paper-60">
          {liveStatus === 'offline'
            ? `Revisions are unavailable — ${liveError ?? 'the server could not reach Supabase.'} (Full booleans: /admin/api/diagnostics.)`
            : 'No revisions yet — publish a change from any editing screen and it lands here.'}
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
        body={`The ${confirming?.changes.length ?? 0} field${confirming?.changes.length === 1 ? '' : 's'} changed in this revision will roll back to their values before it, through the same publish transaction. The reversal is recorded as a new revision.`}
        confirmLabel={busy ? 'Restoring…' : 'Restore'}
        onConfirm={() => {
          if (confirming) void runRestore(confirming);
        }}
      />
    </div>
  );
}
