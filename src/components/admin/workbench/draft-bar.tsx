'use client';

import { useState } from 'react';
import { Eye, Trash2, Upload } from 'lucide-react';
import { useContent } from './content-provider';
import { ConfirmDialog } from './confirm-dialog';
import { usePathname } from 'next/navigation';

/**
 * Persistent bar across every editing screen when drafts exist.
 * Preview is a UI placeholder until the backend lands (tooltipped),
 * Discard and Publish both confirm first. Publish applies drafts to the
 * mock live data, writes a Revision and confirms.
 */
export function DraftBar() {
  const { drafts, discardAll, publish } = useContent();
  const pathname = usePathname();
  const [confirm, setConfirm] = useState<'discard' | 'publish' | null>(null);
  const [publishedNote, setPublishedNote] = useState<string | null>(null);

  // login runs outside the shell — never show the bar there
  if (pathname === '/admin/login' || drafts.length === 0) {
    return publishedNote ? <PublishedNote note={publishedNote} /> : null;
  }

  return (
    <>
      <div className="sticky top-16 z-20 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-card border border-vermilion/40 bg-vermilion-20 px-2.5 py-1 font-mono text-[11px] text-vermilion">
            {drafts.length} unpublished change{drafts.length === 1 ? '' : 's'}
          </span>

          <span
            title="Wired with the backend"
            className="tooltip-placeholder inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[11px] text-paper-40"
          >
            <Eye size={12} />
            Preview
          </span>

          <button
            type="button"
            onClick={() => setConfirm('discard')}
            className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[11px] text-paper-70 hover:border-paper-40 hover:text-paper"
          >
            <Trash2 size={12} />
            Discard
          </button>

          <button
            type="button"
            onClick={() => setConfirm('publish')}
            className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-vermilion px-3 font-mono text-[11px] text-paper hover:bg-[#c92f18]"
          >
            <Upload size={12} />
            Publish
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'discard'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Discard all changes?"
        body={`${drafts.length} unpublished change${drafts.length === 1 ? '' : 's'} will be lost. The published site keeps its current copy.`}
        confirmLabel="Discard changes"
        onConfirm={() => {
          discardAll();
          setConfirm(null);
          setPublishedNote('Drafts discarded — nothing was published.');
        }}
      />

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Publish changes?"
        body={`${drafts.length} change${drafts.length === 1 ? '' : 's'} will go live and be recorded in history. Mock only — nothing is sent to a backend.`}
        confirmLabel="Publish"
        onConfirm={() => {
          const rev = publish();
          setConfirm(null);
          setPublishedNote(
            `Published ${rev.changes.length} change${rev.changes.length === 1 ? '' : 's'} — mock only, recorded as revision ${rev.id}.`
          );
        }}
      />
    </>
  );
}

function PublishedNote({ note }: { note: string }) {
  return (
    <p
      role="status"
      className="mx-4 mb-3 rounded-card border border-line bg-surface px-3 py-2 font-mono text-[11px] text-moss-bright md:mx-8"
    >
      {note}
    </p>
  );
}
