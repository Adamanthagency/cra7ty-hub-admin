'use client';

import { useState } from 'react';
import { Eye, Trash2, Upload, X } from 'lucide-react';
import { useContent } from './content-provider';
import { ConfirmDialog } from './confirm-dialog';
import { usePathname } from 'next/navigation';

/**
 * Persistent bar across every editing screen when drafts exist — and
 * when the workbench is OFFLINE, so a misconfigured deploy names itself
 * ("SUPABASE_SERVICE_ROLE_KEY is not set on this server") instead of
 * quietly showing the local seed.
 * Publish writes the full state to Supabase in one transaction
 * (/admin/api/publish → apply_publish) and records the revision; on
 * failure the drafts stay and the error says why. Discard is local and
 * never writes. Preview is a UI placeholder until the backend lands.
 */
export function DraftBar() {
  const {
    drafts,
    discardAll,
    publish,
    liveStatus,
    liveError,
    revalidateNotice,
    dismissRevalidateNotice,
  } = useContent();
  const pathname = usePathname();
  const [confirm, setConfirm] = useState<'discard' | 'publish' | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // login runs outside the shell — never show the bar there
  if (pathname === '/admin/login') {
    return note ? <PublishedNote note={note} /> : null;
  }

  const runPublish = async () => {
    setBusy(true);
    try {
      const rev = await publish();
      const refreshed = rev.revalidate;
      setNote({
        tone: refreshed && !refreshed.ok ? 'error' : 'ok',
        text:
          refreshed && !refreshed.ok
            ? `Published ${rev.changes.length} change${rev.changes.length === 1 ? '' : 's'} (revision ${rev.id}), but refreshing the live site failed — ${refreshed.error ?? 'unknown error'}. The storefront will catch up within about 5 minutes.`
            : `Published ${rev.changes.length} change${rev.changes.length === 1 ? '' : 's'} — recorded as revision ${rev.id}. Live now${refreshed ? ` (site refreshed in ${refreshed.ms} ms)` : ''}.`,
      });
    } catch (error) {
      setNote({
        tone: 'error',
        text: `Publish failed: ${(error as Error).message}. Your drafts are still here — nothing went live.`,
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const offline = liveStatus === 'offline';

  if (!note && drafts.length === 0 && !offline && !revalidateNotice) return null;

  return (
    <>
      {(note || drafts.length > 0 || offline) && (
        <div
          className={`sticky top-16 z-20 bg-surface/95 px-4 backdrop-blur md:px-8 ${
            drafts.length > 0 ? 'border-b border-line pb-2.5 pt-2' : 'py-2'
          }`}
        >
          {offline && (
            <p
              role="status"
              className="mb-2 rounded-card border border-vermilion/40 bg-vermilion-20 px-3 py-2 font-mono text-[11px] text-vermilion"
            >
              Not connected to Supabase — edits stay on this device and
              Publish will fail. {liveError ?? ''}
            </p>
          )}

          {/* Persistent, dismissible: the DB write succeeded but the
              live-site refresh did not — visible until dismissed or the
              next successful refresh, so a silent staleness is noticed. */}
          {revalidateNotice && (
            <div
              role="alert"
              className="mb-2 flex items-start justify-between gap-3 rounded-card border border-vermilion/40 bg-vermilion-20 px-3 py-2 font-mono text-[11px] text-vermilion"
            >
              <p>
                Last publish went to the database, but refreshing the live
                site failed at{' '}
                {new Date(revalidateNotice.at).toLocaleTimeString()} —{' '}
                {revalidateNotice.error}. The storefront will catch up within
                about 5 minutes.
              </p>
              <button
                type="button"
                onClick={dismissRevalidateNotice}
                aria-label="Dismiss live-refresh warning"
                className="shrink-0 rounded text-vermilion hover:bg-vermilion/10"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {note && <PublishedNote note={note} />}

          {drafts.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
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
                disabled={busy}
                onClick={() => setConfirm('discard')}
                className="inline-flex h-8 items-center gap-1.5 rounded-card border border-line px-2.5 font-mono text-[11px] text-paper-70 hover:border-paper-40 hover:text-paper disabled:opacity-50"
              >
                <Trash2 size={12} />
                Discard
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm('publish')}
                className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-vermilion px-3 font-mono text-[11px] text-paper hover:bg-[#c92f18] disabled:opacity-60"
              >
                <Upload size={12} />
                {busy ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'discard'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Discard all changes?"
        body={`${drafts.length} unpublished change${drafts.length === 1 ? '' : 's'} will be lost. The published site keeps its current copy.`}
        confirmLabel="Discard changes"
        onConfirm={() => {
          discardAll();
          setConfirm(null);
          setNote({ tone: 'ok', text: 'Drafts discarded — nothing was published.' });
        }}
      />

      <ConfirmDialog
        open={confirm === 'publish'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Publish changes?"
        body={`${drafts.length} change${drafts.length === 1 ? '' : 's'} will go live on the storefront and be recorded in history. The whole published state is written in one transaction.`}
        confirmLabel="Publish"
        onConfirm={() => {
          void runPublish();
        }}
      />
    </>
  );
}

function PublishedNote({
  note,
}: {
  note: { tone: 'ok' | 'error'; text: string };
}) {
  return (
    <p
      role="status"
      className={`rounded-card border px-3 py-2 font-mono text-[11px] ${
        note.tone === 'error'
          ? 'border-vermilion/40 bg-vermilion-20 text-vermilion'
          : 'border-line bg-surface text-moss-bright'
      }`}
    >
      {note.text}
    </p>
  );
}
