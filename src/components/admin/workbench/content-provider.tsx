'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  ContentListItem,
  DraftState,
  MediaItem,
  PageKey,
  PageSection,
} from '@/lib/types';
import { fieldSeed, listSeed } from '@/data/mock/content';
import { pageSections as sectionSeed } from '@/data/mock/pages';
import { settings as settingsSeed } from '@/data/mock/settings';
import { categories as categorySeed } from '@/data/mock/categories';
import { revisions as revisionSeed } from '@/data/mock/revisions';
import { media as mediaSeed } from '@/data/mock/media';
import type { Category, Revision, SiteSettings } from '@/lib/types';
import {
  fetchLiveContent,
  fetchMedia,
  postPublish,
  removeMedia as removeMediaRequest,
  uploadMedia as uploadMediaRequest,
  type ListMap,
  type RevalidateStatus,
  type ValueMap,
} from '@/lib/publish-api';

export type { ListMap, ValueMap } from '@/lib/publish-api';

/**
 * The workbench's whole world, in local state.
 *
 * Stage 4 (backend wiring): the initial /data mocks paint instantly, then
 * the provider hydrates from Supabase via /admin/api/content — the admin
 * edits what the storefront actually serves. Publish computes the full
 * next state locally, POSTs it to /admin/api/publish (which calls
 * Supabase's `apply_publish` in one transaction and records the
 * revision), and only applies locally on success — a failed publish
 * leaves the drafts intact and nothing pretends to be live. Discard is
 * and stays local: it never writes.
 *
 * Drafts track list items by stable id — positional content keys
 * (…items.2.question) are derived only for display in revisions.
 */

/** live-state connection, surfaced so screens can say what they show */
export type LiveStatus = 'loading' | 'live' | 'offline';

interface ContentContextValue {
  /* live (published) state */
  values: ValueMap;
  lists: ListMap;
  sections: PageSection[];
  settings: SiteSettings;
  categories: Category[];
  revisions: Revision[];
  /** media library — hydrated live rows; "uploads" go to Storage server-side */
  media: MediaItem[];
  /** upload a batch of 1–6 files (POST /admin/api/media) → stored items; throws */
  uploadMedia: (files: File[]) => Promise<MediaItem[]>;
  /** remove object + row server-side; throws on failure, state untouched */
  removeMedia: (id: string) => Promise<void>;

  /** whether the workbench is showing hydrated live data or the local seed */
  liveStatus: LiveStatus;
  /** why hydration failed, verbatim from the API — null while live */
  liveError: string | null;

  /* drafts */
  drafts: DraftState[];
  /** record or replace a draft for one key (last write wins per key) */
  addDraft: (draft: Omit<DraftState, 'id' | 'at'>) => void;
  /** draft-aware read: overlay pending edits on live values */
  draftValue: (key: string) => string | number | undefined;
  draftList: (key: string) => ContentListItem[] | undefined;
  /** any draft touching this page (by key prefix or section id) */
  draftsForPage: (page: PageKey) => DraftState[];
  discardAll: () => void;
  /**
   * Write the full next state to Supabase (apply_publish) and apply it
   * locally. Throws on failure — drafts stay, nothing goes live.
   */
  publish: () => Promise<Revision & { revalidate?: RevalidateStatus }>;

  /* live-state mutators used after publish / by restore */
  setSection: (id: string, patch: Partial<PageSection>) => void;
  moveSection: (id: string, direction: -1 | 1) => void;
  applyValues: (updates: ValueMap) => void;
  applyList: (key: string, items: ContentListItem[]) => void;
  applySettings: (patch: Partial<SiteSettings>) => void;
  applyCategories: (next: Category[]) => void;
  addRevision: (rev: Revision) => void;
  /**
   * Republish the revision's pre-change values through the same publish
   * transaction, recording the reversal as a new revision. Throws on
   * failure. Section moves are display-only in the diff and are not
   * rolled back.
   */
  restoreRevision: (rev: Revision) => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++uid}`;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Drafts are also persisted to localStorage so a reload (or a crash)
 * does not silently discard in-progress edits. Versioned so a future
 * DraftState shape change can invalidate old entries instead of
 * restoring garbage. Storage is best-effort: when unavailable or
 * blocked (private mode, quota), the admin keeps working from memory
 * exactly as before — persistence only ever ADDS resilience.
 */
const DRAFTS_STORAGE_KEY = 'cra7ty.drafts.v1';

/** Read + validate drafts from localStorage. Never throws; [] when unusable. */
function loadDrafts(): DraftState[] {
  try {
    const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A draft needs at least the fields the workbench reads on render.
    return parsed.filter(
      (d): d is DraftState =>
        typeof d === 'object' &&
        d !== null &&
        typeof (d as DraftState).id === 'string' &&
        typeof (d as DraftState).key === 'string' &&
        typeof (d as DraftState).label === 'string' &&
        ['field', 'list', 'section', 'settings', 'category'].includes(
          (d as DraftState).type
        )
    );
  } catch {
    // blocked storage, malformed JSON, or a non-serialisable value — start clean
    return [];
  }
}

/** Best-effort persist; a blocked/full localStorage is not an error. */
function saveDrafts(drafts: DraftState[]): void {
  try {
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // ignore — drafts still live in memory for this session
  }
}

export function ContentProvider({ children }: { children: ReactNode }) {
  // Local seeds paint the first frame and keep the workbench usable when
  // the API is unreachable; hydration replaces them with live data.
  const [values, setValues] = useState<ValueMap>(() => ({ ...fieldSeed }));
  const [lists, setLists] = useState<ListMap>(() =>
    Object.fromEntries(
      Object.entries(listSeed).map(([k, l]) => [k, clone(l.items)])
    )
  );
  const [sections, setSections] = useState<PageSection[]>(() =>
    clone(sectionSeed)
  );
  const [settings, setSettings] = useState<SiteSettings>(() => clone(settingsSeed));
  const [categories, setCategories] = useState<Category[]>(() => clone(categorySeed));
  const [revisions, setRevisions] = useState<Revision[]>(() => clone(revisionSeed));
  const [media, setMedia] = useState<MediaItem[]>(() => clone(mediaSeed));
  const [drafts, setDrafts] = useState<DraftState[]>(loadDrafts);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('loading');
  const [liveError, setLiveError] = useState<string | null>(null);

  // Persist drafts on every change (add, publish-clear, discard-clear all
  // flow through setDrafts, so this one effect covers all three). Debounced
  // so rapid edits don't thrash the synchronous localStorage write.
  useEffect(() => {
    const t = setTimeout(() => saveDrafts(drafts), 200);
    return () => clearTimeout(t);
  }, [drafts]);

  // Hydrate from Supabase once on mount. A failure is not fatal — the
  // seed stays, liveStatus says so, and publish will report its own error.
  useEffect(() => {
    let cancelled = false;
    fetchLiveContent()
      .then((live) => {
        if (cancelled) return;
        setValues(live.values);
        setLists(live.lists);
        setSections(live.sections);
        setSettings(live.settings);
        setCategories(live.categories);
        setRevisions(live.revisions);
        setLiveError(null);
        setLiveStatus('live');
        // The media library hydrates through its own endpoint; if it
        // fails alone, content that IS live stays live and the seed
        // thumbnails remain — this must not flip status to offline.
        return fetchMedia()
          .then(setMedia)
          .catch((error: Error) => {
            console.warn('[admin] media library unavailable:', error.message);
          });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        console.warn('[admin] live content unavailable:', error.message);
        // keep the exact reason — screens show it instead of a vague
        // "not connected", so a misconfigured deploy names itself
        setLiveError(error.message);
        setLiveStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addDraft = useCallback((draft: Omit<DraftState, 'id' | 'at'>) => {
    setDrafts((prev) => {
      const existing = prev.find((d) => d.key === draft.key);
      const entry: DraftState = {
        ...draft,
        id: existing?.id ?? nextId('draft'),
        at: new Date().toISOString(),
      };
      // last write wins per key; keep the original "before" so Discard
      // and the revision diff still show the true pre-edit value
      if (existing) entry.before = existing.before;
      const without = prev.filter((d) => d.key !== draft.key);
      // identical to live value? drop the draft entirely
      if (JSON.stringify(entry.before) === JSON.stringify(entry.after)) {
        return without;
      }
      return [...without, entry];
    });
  }, []);

  const draftValue = useCallback(
    (key: string) => {
      const d = drafts.find((x) => x.key === key && x.type === 'field');
      return d ? (d.after as string | number) : values[key];
    },
    [drafts, values]
  );

  const draftList = useCallback(
    (key: string) => {
      const d = drafts.find((x) => x.key === key && x.type === 'list');
      return d ? (d.after as ContentListItem[]) : lists[key];
    },
    [drafts, lists]
  );

  const draftsForPage = useCallback(
    (page: PageKey) => {
      const prefix = `${page}.`;
      return drafts.filter(
        (d) =>
          (d.page === page ||
            d.key.startsWith(prefix) ||
            (d.type === 'section' && d.key.startsWith(`${page}-`))) &&
          d.type !== 'settings' &&
          d.type !== 'category'
      );
    },
    [drafts]
  );

  const publish = useCallback(async (): Promise<Revision & { revalidate?: RevalidateStatus }> => {
    const now = new Date().toISOString();
    const changes = drafts.map((d) => ({
      key: d.key,
      label: d.label,
      from: stringifyBefore(d.before),
      to: stringifyAfter(d.after),
    }));
    const rev: Revision = { id: nextId('rev'), at: now, author: 'Studio', changes };

    // Compute the complete next published state — the same apply
    // semantics as before, but as data we can hand to the transaction.
    const nextValues: ValueMap = { ...values };
    const nextLists: ListMap = clone(lists);
    const nextSections: PageSection[] = clone(sections);
    const nextSettings: SiteSettings = { ...settings, seo: { ...settings.seo } };
    let categoryDraft: DraftState | null = null;

    for (const d of drafts) {
      if (d.type === 'field') {
        nextValues[d.key] = d.after as string | number;
      } else if (d.type === 'list') {
        nextLists[d.key] = clone(d.after as ContentListItem[]);
      } else if (d.type === 'section') {
        const target = nextSections.find((s) => s.id === d.key);
        if (target) Object.assign(target, d.after as Partial<PageSection>);
      } else if (d.type === 'settings') {
        const patch = d.after as Partial<SiteSettings>;
        Object.assign(nextSettings, patch);
        if (patch.seo) nextSettings.seo = { ...nextSettings.seo, ...patch.seo };
      } else if (d.type === 'category') {
        categoryDraft = d;
      }
    }

    // Categories ride the same transaction: the draft's array when one is
    // pending, otherwise the current live array (apply_publish updates the
    // fixed-id rows' editable columns and never touches model/count).
    const nextCategories: Category[] = categoryDraft
      ? clone(categoryDraft.after as Category[])
      : clone(categories);

    // One atomic write (apply_publish). Throws on failure — the caller
    // keeps the drafts and nothing is applied locally.
    const published = await postPublish({
      values: nextValues,
      lists: nextLists,
      sections: nextSections,
      settings: nextSettings,
      categories: nextCategories,
      revision: rev,
    });

    setValues(nextValues);
    setLists(nextLists);
    setSections(nextSections);
    setSettings(nextSettings);
    setCategories(nextCategories);
    setRevisions((prev) => [rev, ...prev]);
    setDrafts([]);
    return { ...rev, revalidate: published.revalidate };
  }, [drafts, values, lists, sections, settings, categories]);

  const setSection = useCallback((id: string, patch: Partial<PageSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }, []);

  const moveSection = useCallback((id: string, direction: -1 | 1) => {
    setSections((prev) => {
      const next = clone(prev);
      const page = next.find((s) => s.id === id)?.page;
      const siblings = next
        .filter((s) => s.page === page)
        .sort((a, b) => a.position - b.position);
      const i = siblings.findIndex((s) => s.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= siblings.length) return prev;
      [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
      siblings.forEach((s, idx) => (s.position = idx + 1));
      return next.map((s) => siblings.find((x) => x.id === s.id) ?? s);
    });
  }, []);

  const applyValues = useCallback((updates: ValueMap) => {
    setValues((prev) => ({ ...prev, ...updates }));
  }, []);

  const applyList = useCallback((key: string, items: ContentListItem[]) => {
    setLists((prev) => ({ ...prev, [key]: items }));
  }, []);

  const applySettings = useCallback((patch: Partial<SiteSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyCategories = useCallback((next: Category[]) => {
    setCategories(next);
  }, []);

  const addRevision = useCallback((rev: Revision) => {
    setRevisions((prev) => [rev, ...prev]);
  }, []);

  // Server first, state second: the API call must succeed before the
  // library changes, so a failed upload/delete never fakes success —
  // the same rule publish follows.
  const uploadMedia = useCallback(async (files: File[]): Promise<MediaItem[]> => {
    const items = await uploadMediaRequest(files);
    // Server confirmed first; the batch lands at the top in the order it
    // was selected, so what you just added is what you see.
    setMedia((prev) => [...items, ...prev]);
    return items;
  }, []);

  const removeMedia = useCallback(async (id: string): Promise<void> => {
    await removeMediaRequest(id);
    setMedia((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const restoreRevision = useCallback(
    async (rev: Revision) => {
      // Restore applies each change's "from" value as new live state and
      // republishes through the SAME transaction (the approved
      // apply_publish-only design), recording the reversal.
      const sectionIds = new Set(sections.map((s) => s.id));
      const updates: ValueMap = {};
      const listRows: {
        listKey: string;
        itemId: string;
        fieldKey: string;
        value: string;
      }[] = [];
      for (const c of rev.changes) {
        // section changes are display-only in the diff (id, not key) and
        // cannot be reconstructed from it — sections stay as they are
        if (sectionIds.has(c.key)) continue;
        if (c.key.startsWith('settings.')) continue;
        // Category changes record only counts ("6 items") in the diff —
        // the pre-edit copy is not recoverable from a revision, so
        // categories stay as they are rather than being corrupted by
        // treating the display string as a content key.
        if (c.key === 'categories') continue;
        const m = /^(.+):([^:]+):(.+)$/.exec(c.key);
        if (m) {
          listRows.push({ listKey: m[1]!, itemId: m[2]!, fieldKey: m[3]!, value: c.from });
        } else {
          updates[c.key] = c.from;
        }
      }

      const nextValues: ValueMap = { ...values, ...updates };
      const nextLists: ListMap = clone(lists);
      for (const row of listRows) {
        const items = nextLists[row.listKey];
        if (!items) continue;
        nextLists[row.listKey] = items.map((it) =>
          it.id === row.itemId
            ? { ...it, fields: { ...it.fields, [row.fieldKey]: row.value } }
            : it
        );
      }

      const nextSettings: SiteSettings = { ...settings, seo: { ...settings.seo } };
      for (const c of rev.changes) {
        if (!c.key.startsWith('settings.')) continue;
        const path = c.key.slice('settings.'.length);
        if (path === 'freeDeliveryOver') {
          const n = Number(c.from.replace(/[^0-9]/g, ''));
          if (Number.isFinite(n)) nextSettings.freeDeliveryOver = n;
        } else {
          const m = /^seo\.(\w+)\.(title|description)$/.exec(path);
          if (m) {
            const pageKey = m[1]! as keyof SiteSettings['seo'];
            nextSettings.seo[pageKey] = {
              title: '',
              description: '',
              ...nextSettings.seo[pageKey],
              [m[2]!]: c.from,
            };
          }
        }
      }

      const reversal: Revision = {
        id: nextId('rev'),
        at: new Date().toISOString(),
        author: 'Studio',
        changes: rev.changes.map((c) => ({
          key: c.key,
          label: c.label,
          from: c.to,
          to: c.from,
        })),
      };

      await postPublish({
        values: nextValues,
        lists: nextLists,
        sections,
        settings: nextSettings,
        categories: clone(categories),
        revision: reversal,
      });

      setValues(nextValues);
      setLists(nextLists);
      setSettings(nextSettings);
      setRevisions((prev) => [reversal, ...prev]);
    },
    [values, lists, sections, settings, categories]
  );

  const value = useMemo<ContentContextValue>(
    () => ({
      values,
      lists,
      sections,
      settings,
      categories,
      revisions,
      media,
      uploadMedia,
      removeMedia,
      liveStatus,
      liveError,
      drafts,
      addDraft,
      draftValue,
      draftList,
      draftsForPage,
      discardAll: () => setDrafts([]),
      publish,
      setSection,
      moveSection,
      applyValues,
      applyList,
      applySettings,
      applyCategories,
      addRevision,
      restoreRevision,
    }),
    [
      values,
      lists,
      sections,
      settings,
      categories,
      revisions,
      media,
      uploadMedia,
      removeMedia,
      liveStatus,
      liveError,
      drafts,
      addDraft,
      draftValue,
      draftList,
      draftsForPage,
      publish,
      setSection,
      moveSection,
      applyValues,
      applyList,
      applySettings,
      applyCategories,
      addRevision,
      restoreRevision,
    ]
  );

  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}

function stringifyBefore(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  return v ? 'changed' : '—';
}

function stringifyAfter(v: unknown): string {
  return stringifyBefore(v);
}

export function useContent(): ContentContextValue {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent must be used inside ContentProvider');
  return ctx;
}
