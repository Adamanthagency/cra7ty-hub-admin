'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { SidePanel } from '@/components/admin/side-panel';
import { useContent } from './content-provider';
import type { MediaItem } from '@/lib/types';

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MediaItem) => void;
}

/**
 * "Choose from media" slide-over. Shows the local library as a grid;
 * picking a file hands its URL back to the caller (product image slot,
 * blog cover). No upload happens here — the Media page owns that.
 */
export function MediaPicker({ open, onOpenChange, onSelect }: MediaPickerProps) {
  const { media } = useContent();
  const [filter, setFilter] = useState('');

  const visible = media.filter((m) =>
    m.filename.toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Choose from media"
      description={`${media.length} file${media.length === 1 ? '' : 's'} · add new ones on the Media page`}
    >
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search filename"
        aria-label="Search media"
        className="input-hairline mb-3"
      />

      {visible.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-6 text-center font-mono text-xs text-paper-60">
          {media.length === 0
            ? 'No media yet — add files on the Media page.'
            : 'Nothing matches that search.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  onOpenChange(false);
                }}
                className="group relative flex w-full flex-col overflow-hidden rounded-card border border-line bg-bg/50 text-left transition-colors hover:border-paper-40"
              >
                <span className="flex aspect-square items-center justify-center bg-kraft-12">
                  <span className="font-display text-2xl text-kraft-60" aria-hidden>
                    {item.filename.charAt(0).toUpperCase()}
                  </span>
                </span>
                <span className="flex items-center gap-1 p-2">
                  <Check
                    size={11}
                    aria-hidden
                    className="shrink-0 text-transparent transition-colors group-hover:text-paper-40"
                  />
                  <span className="truncate font-mono text-[10px] text-paper-70">
                    {item.filename}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidePanel>
  );
}
