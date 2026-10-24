'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

interface StorefrontFrameProps {
  /** Full URL including ?cra7ty-edit=1, or null when the origin env var is missing. */
  src: string | null;
  deviceWidth: number;
  status: 'loading' | 'ready' | 'error';
  /** The URL the frame tried — shown verbatim in the error state. */
  errorUrl: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  /** Bumped by the parent on retry to remount the iframe. */
  reloadKey: number;
  onLoad: () => void;
  onRetry: () => void;
}

/**
 * The storefront preview: an iframe rendered at the chosen device width
 * and CSS-scaled to fit the available area, so the frame always shows
 * the site at exactly 390 / 768 / 1440 CSS pixels. The document inside
 * the iframe scrolls normally. Loading and unreachable states render as
 * opaque overlays in existing admin tokens; every received value is
 * rendered as plain text.
 */
export function StorefrontFrame({
  src,
  deviceWidth,
  status,
  errorUrl,
  iframeRef,
  reloadKey,
  onLoad,
  onRetry,
}: StorefrontFrameProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit-to-width: never upscale past 1:1, shrink only when the device
  // is wider than the available space.
  const scale = box.w > 0 ? Math.min(1, box.w / deviceWidth) : 1;
  const iframeHeight = box.h > 0 ? Math.max(1, box.h / scale) : 640;
  const offsetX = box.w > 0 ? Math.max(0, (box.w - deviceWidth * scale) / 2) : 0;

  return (
    <div
      ref={boxRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-bg"
      data-testid="frame-box"
    >
      {src && (
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={src}
          title="Storefront preview"
          onLoad={onLoad}
          style={{
            position: 'absolute',
            top: 0,
            left: offsetX,
            width: deviceWidth,
            height: iframeHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 0,
            background: 'transparent',
          }}
        />
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg">
          <span
            aria-hidden
            className="h-5 w-5 animate-spin rounded-full border-2 border-paper-40 border-t-transparent"
          />
          <p className="font-mono text-[11px] text-paper-60">Loading storefront…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="w-full max-w-lg rounded-card border border-line bg-surface p-5">
            <p className="font-display text-lg text-paper">Storefront not reachable</p>
            <p className="mt-1 font-mono text-[11px] text-paper-60">
              The frame did not confirm edit mode in time.
            </p>
            <p className="mt-3 break-all rounded-card border border-line bg-bg px-3 py-2 text-left font-mono text-[11px] text-paper-70">
              {errorUrl}
            </p>
            <p className="mt-3 text-left text-xs leading-relaxed text-paper-60">
              Check that NEXT_PUBLIC_STOREFRONT_ORIGIN matches the running
              storefront and that it is up, then try again.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 h-9 rounded-[4px] bg-vermilion px-4 font-mono text-[11px] text-paper hover:bg-[#c92f18]"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
