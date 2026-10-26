'use client';

import { useEffect, useRef, useState } from 'react';

interface MediaImgProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * A real <img> for a Supabase Storage URL, layered over whatever
 * placeholder the caller renders behind it (the media library's kraft
 * letter tile, a product editor slot, the blog editor's cover box).
 *
 * The grid originally hid the image permanently on the first error, so
 * ONE transient network failure left a letter tile for the rest of the
 * page view. Now a failed load retries up to MAX_RETRIES times on a
 * short backoff, with a cache-busting query so a cached failure can't
 * stick; only a URL that fails every attempt stays hidden (the
 * placeholder behind shows through).
 */
const MAX_RETRIES = 2;

export function MediaImg({ src, alt, className }: MediaImgProps) {
  const [attempt, setAttempt] = useState(0);
  const [dead, setDead] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // A pending retry must not fire after unmount.
  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  if (dead) return null;

  // Supabase Storage ignores query parameters on public object URLs, so
  // a retry re-requests the same bytes without reusing a cached failure.
  const url = attempt === 0 ? src : `${src}?retry=${attempt}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- cross-origin Supabase Storage URL in an admin tool; next/image would need a remotePatterns entry for this origin
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => {
        if (attempt >= MAX_RETRIES) {
          setDead(true);
          return;
        }
        timer.current = window.setTimeout(
          () => setAttempt((current) => current + 1),
          400 * (attempt + 1),
        );
      }}
    />
  );
}
