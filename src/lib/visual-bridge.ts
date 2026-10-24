import type { ContentListItem } from '@/lib/types';

/**
 * The admin ⇄ storefront message bridge for the Visual editor.
 *
 * Every message is shaped `{ source: 'cra7ty', type, payload }`.
 *
 * Security contract (enforced by this module, not by callers):
 * - `receiveMessage` checks `event.origin` against
 *   NEXT_PUBLIC_STOREFRONT_ORIGIN on EVERY incoming message and returns
 *   null for anything else — wrong origin, wrong schema, wrong types.
 * - `postToStorefront` always posts with the exact storefront origin as
 *   targetOrigin, never '*'. If the env var is missing or unusable it
 *   sends nothing at all.
 * - All received values are validated as plain text (length-capped
 *   strings, finite numbers). Nothing here parses HTML; callers must
 *   render received values as text only.
 *
 * Contract notes for the storefront side:
 * - `init` carries published values overlaid with pending drafts, so the
 *   frame always mirrors the draft state. The frame should reply `ready`
 *   once its edit-mode bridge is listening.
 * - `highlight { key }` accepts either a content key
 *   (`home.hero.headline.0`) or a section key (`hero`) — the frame
 *   resolves whichever it has.
 * - Storefront `select-field` for a list row uses a positional content
 *   key (`home.faq.items.2.question`) or the exact list key
 *   (`home.faq.items`); the admin maps either to the ListEditor row.
 */

export const CRA7TY_SOURCE = 'cra7ty';

/* ------------------------------------------------------------------ */
/* Admin → storefront payloads                                          */
/* ------------------------------------------------------------------ */

export interface SectionsPayload {
  page: string;
  /** section keys in visible display order */
  order: string[];
  /** section keys hidden by the client */
  hidden: string[];
  /** section key → chosen variant */
  variants: Record<string, string>;
}

export interface InitPayload {
  page: string;
  /** every content key → published value overlaid with drafts */
  values: Record<string, string | number>;
  /** every list key → published items overlaid with drafts */
  lists: Record<string, ContentListItem[]>;
  sections: SectionsPayload;
}

export type AdminToStorefrontType =
  | 'init'
  | 'set-field'
  | 'set-list'
  | 'set-sections'
  | 'highlight'
  | 'clear';

export type AdminMessage =
  | { source: typeof CRA7TY_SOURCE; type: 'init'; payload: InitPayload }
  | {
      source: typeof CRA7TY_SOURCE;
      type: 'set-field';
      payload: { key: string; value: string | number };
    }
  | { source: typeof CRA7TY_SOURCE; type: 'set-list'; payload: { key: string; items: ContentListItem[] } }
  | { source: typeof CRA7TY_SOURCE; type: 'set-sections'; payload: SectionsPayload }
  | { source: typeof CRA7TY_SOURCE; type: 'highlight'; payload: { key: string } }
  | { source: typeof CRA7TY_SOURCE; type: 'clear'; payload: Record<string, never> };

/* ------------------------------------------------------------------ */
/* Storefront → admin payloads                                          */
/* ------------------------------------------------------------------ */

export interface ReadyPayload {
  page: string;
  /** content keys the frame can address on this page */
  keys: string[];
  /** section keys rendered on this page */
  sections: string[];
}

export interface SelectFieldPayload {
  key: string;
  /** viewport-relative rect of the clicked node */
  rect: { top: number; left: number; width: number; height: number };
}

export interface SelectSectionPayload {
  page: string;
  sectionKey: string;
}

export type StorefrontMessage =
  | { type: 'ready'; payload: ReadyPayload }
  | { type: 'select-field'; payload: SelectFieldPayload }
  | { type: 'select-section'; payload: SelectSectionPayload };

/* ------------------------------------------------------------------ */
/* Env / origin helpers                                                 */
/* ------------------------------------------------------------------ */

const MAX_KEY_LENGTH = 160;
const MAX_TEXT_LENGTH = 20_000;
const MAX_ARRAY_LENGTH = 500;
const MAX_ARRAY_ITEM_LENGTH = 400;

/**
 * The exact storefront origin (scheme + host + port) to validate against
 * and to post with. null when the env var is missing, not an http(s) URL,
 * or contains a wildcard — in which case the bridge stays silent.
 */
export function getStorefrontOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN;
  if (!raw || raw.includes('*')) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Validation primitives (plain text only)                              */
/* ------------------------------------------------------------------ */

/** Content/section keys: dot-separated safe segments, e.g. `home.hero.headline.0`. */
const KEY_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

function isKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH &&
    KEY_PATTERN.test(value)
  );
}

/** Plain text: string within the cap, or a finite number. Never HTML-handled. */
function isTextValue(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
}

function isTextArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ARRAY_LENGTH &&
    value.every(
      (item) => typeof item === 'string' && item.length <= MAX_ARRAY_ITEM_LENGTH
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Content list rows, as the admin's ListEditor stores them. */
function isListItems(value: unknown): value is ContentListItem[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ARRAY_LENGTH &&
    value.every(
      (item) =>
        isRecord(item) &&
        isKey(item.id) &&
        isRecord(item.fields) &&
        Object.entries(item.fields).every(
          ([, v]) =>
            typeof v === 'string' ||
            typeof v === 'boolean' ||
            (typeof v === 'number' && Number.isFinite(v))
        )
    )
  );
}

function isSectionsPayload(value: unknown): value is SectionsPayload {
  if (!isRecord(value)) return false;
  if (!isKey(value.page)) return false;
  if (!isTextArray(value.order)) return false;
  if (!isTextArray(value.hidden)) return false;
  if (!isRecord(value.variants)) return false;
  return Object.entries(value.variants).every(
    ([k, v]) =>
      k.length <= MAX_KEY_LENGTH &&
      typeof v === 'string' &&
      v.length <= MAX_ARRAY_ITEM_LENGTH
  );
}

/* ------------------------------------------------------------------ */
/* Sending (admin → storefront)                                         */
/* ------------------------------------------------------------------ */

/**
 * Outgoing-envelope guard: shape, type and payload must all check out
 * before anything leaves the admin. Returns false for anything else.
 */
function isAdminMessage(data: unknown): data is AdminMessage {
  if (!isRecord(data)) return false;
  if (data.source !== CRA7TY_SOURCE) return false;
  const payload: unknown = data.payload;

  switch (data.type) {
    case 'init':
      return (
        isRecord(payload) &&
        isKey(payload.page) &&
        isRecord(payload.values) &&
        Object.values(payload.values).every(isTextValue) &&
        isRecord(payload.lists) &&
        Object.values(payload.lists).every(isListItems) &&
        isSectionsPayload(payload.sections)
      );
    case 'set-field':
      return (
        isRecord(payload) &&
        isKey(payload.key) &&
        isTextValue(payload.value)
      );
    case 'set-list':
      return (
        isRecord(payload) && isKey(payload.key) && isListItems(payload.items)
      );
    case 'set-sections':
      return isSectionsPayload(payload);
    case 'highlight':
      return isRecord(payload) && isKey(payload.key);
    case 'clear':
      return isRecord(payload) && Object.keys(payload).length === 0;
    default:
      return false;
  }
}

/**
 * Post one message to the storefront frame with the exact storefront
 * origin as targetOrigin. Never '*', never any other origin.
 *
 * Returns false (sending nothing) when the frame window is gone, the
 * env var is missing/invalid, or the message itself fails validation.
 */
export function postToStorefront(
  target: Window | null | undefined,
  message: AdminMessage
): boolean {
  const origin = getStorefrontOrigin();
  if (!origin || !target) return false;
  if (!isAdminMessage(message)) return false;
  target.postMessage(message, origin);
  return true;
}

/* ------------------------------------------------------------------ */
/* Receiving (storefront → admin)                                       */
/* ------------------------------------------------------------------ */

/**
 * Validate one inbound MessageEvent. Returns the parsed message only
 * when ALL of the following hold:
 *  - `event.origin` is exactly the configured storefront origin
 *  - the envelope is `{ source: 'cra7ty', type, payload }` with a known type
 *  - the payload matches that type's schema (plain text, length-capped)
 *  - `event.source` is the expected window, when one is provided
 *
 * Anything else returns null and must be ignored by the caller.
 */
export function receiveMessage(
  event: MessageEvent,
  expectedOrigin: string | null,
  expectedSource?: Window | null
): StorefrontMessage | null {
  if (!expectedOrigin) return null;
  if (event.origin !== expectedOrigin) return null;
  if (expectedSource != null && event.source !== expectedSource) return null;

  const data: unknown = event.data;
  if (!isRecord(data)) return null;
  if (data.source !== CRA7TY_SOURCE) return null;
  if (typeof data.type !== 'string') return null;
  const payload: unknown = data.payload;
  if (!isRecord(payload)) return null;

  switch (data.type) {
    case 'ready': {
      if (!isKey(payload.page)) return null;
      if (!isTextArray(payload.keys)) return null;
      if (!isTextArray(payload.sections)) return null;
      return {
        type: 'ready',
        payload: {
          page: payload.page,
          keys: payload.keys,
          sections: payload.sections,
        },
      };
    }

    case 'select-field': {
      if (!isKey(payload.key)) return null;
      const rect: unknown = payload.rect;
      if (!isRecord(rect)) return null;
      const sides = [rect.top, rect.left, rect.width, rect.height];
      if (!sides.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        return null;
      }
      return {
        type: 'select-field',
        payload: {
          key: payload.key,
          rect: {
            top: rect.top as number,
            left: rect.left as number,
            width: rect.width as number,
            height: rect.height as number,
          },
        },
      };
    }

    case 'select-section': {
      if (!isKey(payload.page)) return null;
      if (!isKey(payload.sectionKey)) return null;
      return {
        type: 'select-section',
        payload: { page: payload.page, sectionKey: payload.sectionKey },
      };
    }

    default:
      return null;
  }
}
