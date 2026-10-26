import type { MediaItem } from '@/lib/types';

/**
 * Placeholder media library. No real binaries exist yet — thumbnails
 * render as kraft tiles in the UI. Sizes are realistic bytes so the
 * mono size column and the 5 MB rule have something honest to show.
 */
export const media: MediaItem[] = [
  {
    id: 'media-crane-string',
    filename: 'crane-string-hang.jpg',
    url: '/media/crane-string-hang.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 412_847,
    createdAt: '2026-10-12T10:24:00Z',
  },
  {
    id: 'media-plates-stack',
    filename: 'bagasse-plates-stack.png',
    url: '/media/bagasse-plates-stack.png',
    mimeType: 'image/png',
    sizeBytes: 1_284_093,
    createdAt: '2026-10-12T10:31:00Z',
  },
  {
    id: 'media-party-sleeve',
    filename: 'party-pack-sleeve.webp',
    url: '/media/party-pack-sleeve.webp',
    mimeType: 'image/webp',
    sizeBytes: 218_556,
    createdAt: '2026-10-14T15:02:00Z',
  },
  {
    id: 'media-studio-table',
    filename: 'studio-cutting-table.jpg',
    url: '/media/studio-cutting-table.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 733_410,
    createdAt: '2026-10-15T09:18:00Z',
  },
  {
    id: 'media-gift-boxes',
    filename: 'gift-box-flat-pack.png',
    url: '/media/gift-box-flat-pack.png',
    mimeType: 'image/png',
    sizeBytes: 954_221,
    createdAt: '2026-10-18T13:47:00Z',
  },
  {
    id: 'media-bouquet',
    filename: 'flower-bouquet-pair.webp',
    url: '/media/flower-bouquet-pair.webp',
    mimeType: 'image/webp',
    sizeBytes: 187_994,
    createdAt: '2026-10-20T16:05:00Z',
  },
];

/** Rules surfaced in the upload zone UI. */
export const MEDIA_RULES = {
  acceptedTypes: ['jpg', 'png', 'webp'] as const,
  acceptedMime: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 5 * 1024 * 1024,
  /** files per drop/selection — mirrored by MAX_BATCH in media-store.ts */
  maxPerBatch: 6,
};
