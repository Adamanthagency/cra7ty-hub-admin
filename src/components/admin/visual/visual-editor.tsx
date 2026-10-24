'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useContent } from '@/components/admin/workbench/content-provider';
import { DraftBar } from '@/components/admin/workbench/draft-bar';
import { contentFields, contentLists } from '@/data/mock/content';
import { sectionsForPage, type PageMeta } from '@/data/mock/pages';
import type { ContentListItem, PageKey, PageSection } from '@/lib/types';
import {
  getStorefrontOrigin,
  postToStorefront,
  receiveMessage,
} from '@/lib/visual-bridge';
import { DeviceToggle, type DeviceKey } from './device-toggle';
import { StorefrontFrame } from './storefront-frame';
import { SidePanel, type PanelSelection } from './side-panel';
import { SectionControls } from './section-controls';

/**
 * Storefront path per page key for the preview frame. `global` renders
 * everywhere, so it previews the home route. The product template and
 * tracker have no stable route of their own — if the path 404s, the
 * frame reports "Storefront not reachable" with the URL it tried, which
 * is the honest outcome.
 */
const FRAME_PATHS: Record<PageKey, string> = {
  home: '/',
  shop: '/shop',
  blog: '/blog',
  about: '/about',
  product: '/products/origami-crane-single',
  tracker: '/tracker',
  global: '/',
};

const READY_TIMEOUT_MS = 10_000;

/**
 * The Visual editor shell: top toolbar (page title, device toggle,
 * unpublished count, and the existing DraftBar's Preview / Discard /
 * Publish), the scaled storefront frame filling the rest, and — from
 * Stage 3 — the right-hand side panel.
 *
 * Bridge security lives in visual-bridge.ts: every inbound message is
 * origin-checked and schema-checked before it reaches this component,
 * and every outbound message posts with the exact storefront origin.
 */
export function VisualEditor({ page }: { page: PageMeta }) {
  const { drafts, draftValue, draftList, sections } = useContent();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<DeviceKey>('phone');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  const origin = getStorefrontOrigin();
  const src = origin ? `${origin}${FRAME_PATHS[page.key]}?cra7ty-edit=1` : null;
  const errorUrl =
    src ?? 'No URL — NEXT_PUBLIC_STOREFRONT_ORIGIN is not set for this build.';

  const [selection, setSelection] = useState<PanelSelection>({ kind: 'none' });
  const [panelOpen, setPanelOpen] = useState(false); // mobile sheet

  /** One validated outbound message to the frame. */
  const post = useCallback((message: Parameters<typeof postToStorefront>[1]) => {
    postToStorefront(iframeRef.current?.contentWindow, message);
  }, []);/** Section state as the frame should see it: seed order overlaid with
     *  drafts, then re-sorted by the LIVE positions moveSection renumbers
     *  (sectionsForPage only knows static seed order), so a Move in the
     *  panel actually broadcasts a new order. */
    const buildSectionsPayload = useCallback(
      (pageKey: PageKey) => {
        const list = sectionsForPage(pageKey)
          .map((seed) => {
            const live = sections.find((s) => s.id === seed.id) ?? seed;
            const pending = drafts.find(
              (d) => d.type === 'section' && d.key === live.id
            );
            return pending
              ? { ...live, ...(pending.after as Partial<PageSection>) }
              : live;
          })
          .sort((a, b) => a.position - b.position);
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
    },
    [sections, drafts]
  );

  /** Full frame resync: published values overlaid with drafts, per spec. */
  const sendInit = useCallback(() => {
    const values: Record<string, string | number> = {};
    for (const f of contentFields) values[f.key] = draftValue(f.key) ?? f.value;
    const lists: Record<string, ContentListItem[]> = {};
    for (const l of contentLists) lists[l.key] = draftList(l.key) ?? l.items;

    postToStorefront(iframeRef.current?.contentWindow, {
      source: 'cra7ty',
      type: 'init',
      payload: {
        page: page.key,
        values,
        lists,
        sections: buildSectionsPayload(page.key),
      },
    });
  }, [draftValue, draftList, buildSectionsPayload, page.key]);

  /* Inbound: ready / select-field / select-section (origin-checked in
     receiveMessage; anything invalid is silently ignored). */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = receiveMessage(
        event,
        getStorefrontOrigin(),
        iframeRef.current?.contentWindow ?? null
      );
      if (!message) return;
      if (message.type === 'ready') {
        setStatus('ready');
        sendInit();
        return;
      }
      if (message.type === 'select-field') {
        setSelection({ kind: 'field', key: message.payload.key });
        setPanelOpen(true);
        return;
      }
      // select-section: map the frame's section key to this page's id.
      const match = sectionsForPage(page.key).find(
        (s) => s.key === message.payload.sectionKey
      );
      if (match) {
        setSelection({ kind: 'section', sectionId: match.id });
        setPanelOpen(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendInit, page.key]);

  /* Loading deadline: no handshake within the window → honest error
     with the URL that was tried. 'ready' wins over the late timer. */
  useEffect(() => {
    if (!src) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    const timer = window.setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'error' : s));
    }, READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [src, reloadKey]);

  /* Discard / publish empties the drafts — resync so the frame never
     keeps copy that no longer exists. */
  const previousDraftCount = useRef(0);
  useEffect(() => {
    const count = drafts.length;
    if (previousDraftCount.current > 0 && count === 0) sendInit();
    previousDraftCount.current = count;
  }, [drafts.length, sendInit]);

  /* Any section change (outline move/hide, variant draft, section-form
     save) → broadcast set-sections so the frame reorders/hides live.
     Signature-keyed so field keystrokes don't spam the frame. */
  const sectionsSignature = JSON.stringify(buildSectionsPayload(page.key));
  const lastSectionsSignature = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    if (lastSectionsSignature.current === sectionsSignature) return;
    const isFirst = lastSectionsSignature.current === null;
    lastSectionsSignature.current = sectionsSignature;
    if (isFirst) return; // init already carried this state
    post({
      source: 'cra7ty',
      type: 'set-sections',
      payload: buildSectionsPayload(page.key),
    });
  }, [sectionsSignature, status, page.key, buildSectionsPayload, post]);

  /* Closing the panel / clearing a selection clears frame highlight. */
  const closePanel = useCallback(() => {
    setSelection({ kind: 'none' });
    setPanelOpen(false);
    post({ source: 'cra7ty', type: 'clear', payload: {} });
  }, [post]);

  /* Below 768px the phone width is forced (the toggle is hidden there). */
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const forcePhone = () => {
      if (query.matches) setDevice('phone');
    };
    forcePhone();
    query.addEventListener('change', forcePhone);
    return () => query.removeEventListener('change', forcePhone);
  }, []);

  const pending = draftsForPageCount(drafts, page.key);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-4rem)] flex-col overflow-hidden md:-mx-8 md:-my-8">
      {/* ── toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:px-8">
        <Link
          href="/admin/pages"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
        >
          <ArrowLeft size={13} aria-hidden />
          All pages
        </Link>

        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate font-display text-lg text-paper">
            {page.label}
          </h1>
          <span className="hidden font-mono text-[11px] text-paper-40 sm:inline">
            {page.route}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DeviceToggle value={device} onChange={setDevice} />
          <button
            type="button"
            onClick={() => {
              setPanelOpen((v) => !v);
              if (panelOpen) setSelection({ kind: 'none' });
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-card border border-line px-3 font-mono text-[11px] text-paper-70 hover:border-paper-40 hover:text-paper md:hidden"
          >
            {panelOpen ? 'Close panel' : 'Outline'}
          </button>
          <span
            className={
              pending > 0
                ? 'inline-flex items-center gap-2 rounded-card border border-vermilion/40 bg-vermilion-20 px-2.5 py-1 font-mono text-[11px] text-vermilion'
                : 'inline-flex items-center gap-2 rounded-card border border-line px-2.5 py-1 font-mono text-[11px] text-paper-40'
            }
          >
            {pending} unpublished change{pending === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* DraftBar: Preview / Discard / Publish (existing component;
          suppressed in the admin layout on visual routes to avoid a
          duplicate bar above this one). */}
      <DraftBar />

      {/* ── frame + side panel ─────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <StorefrontFrame
          src={src}
          deviceWidth={device === 'phone' ? 390 : device === 'tablet' ? 768 : 1440}
          status={status}
          errorUrl={errorUrl}
          iframeRef={iframeRef}
          reloadKey={reloadKey}
          onLoad={() => undefined}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
        <SidePanel
          pageKey={page.key}
          open={panelOpen}
          selection={selection}
          onSelect={(next) => {
            setSelection(next);
            if (next.kind !== 'none') setPanelOpen(true);
          }}
          post={post}
          onClose={closePanel}
          sectionControls={(section, onBack) => (
            <SectionControls
              section={section}
              pageKey={page.key}
              post={post}
              onBack={onBack}
            />
          )}
        />
      </div>
    </div>
  );
}

/** Unpublished drafts touching this page (key prefix or section id). */
function draftsForPageCount(
  drafts: ReturnType<typeof useContent>['drafts'],
  page: PageKey
): number {
  const prefix = `${page}.`;
  return drafts.filter(
    (d) =>
      (d.page === page ||
        d.key.startsWith(prefix) ||
        (d.type === 'section' && d.key.startsWith(`${page}-`))) &&
      d.type !== 'settings' &&
      d.type !== 'category'
  ).length;
}
