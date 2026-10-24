'use client';

import {
  createContext,
  useCallback,
  useContext,
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

/**
 * The workbench's whole world, in local state. Publish applies drafts to
 * the live values and writes a Revision; nothing ever leaves the browser.
 * Drafts track list items by stable id — positional content keys
 * (…items.2.question) are derived only for display in revisions.
 */

export type ValueMap = Record<string, string | number>;
export type ListMap = Record<string, ContentListItem[]>;

interface ContentContextValue {
  /* live (published) state */
  values: ValueMap;
  lists: ListMap;
  sections: PageSection[];
  settings: SiteSettings;
  categories: Category[];
  revisions: Revision[];
  /** media library — local-only; "uploads" never leave the browser */
  media: MediaItem[];
  addMedia: (item: MediaItem) => void;
  removeMedia: (id: string) => void;

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
  /** apply drafts to live state, append a Revision, clear drafts */
  publish: () => Revision;

  /* live-state mutators used after publish / by Stage 6 restore */
  setSection: (id: string, patch: Partial<PageSection>) => void;
  moveSection: (id: string, direction: -1 | 1) => void;
  applyValues: (updates: ValueMap) => void;
  applyList: (key: string, items: ContentListItem[]) => void;
  applySettings: (patch: Partial<SiteSettings>) => void;
  applyCategories: (next: Category[]) => void;
  addRevision: (rev: Revision) => void;
  restoreRevision: (rev: Revision) => void;
}

const ContentContext = createContext<ContentContextValue | null>(null);

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++uid}`;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function ContentProvider({ children }: { children: ReactNode }) {
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
  const [drafts, setDrafts] = useState<DraftState[]>([]);

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

  const publish = useCallback((): Revision => {
    const now = new Date().toISOString();
    const changes = drafts.map((d) => ({
      key: d.key,
      label: d.label,
      from: stringifyBefore(d.before),
      to: stringifyAfter(d.after),
    }));
    const rev: Revision = {
      id: nextId('rev'),
      at: now,
      author: 'Studio',
      changes,
    };

    setValues((prev) => {
      const next = { ...prev };
      for (const d of drafts) {
        if (d.type === 'field') next[d.key] = d.after as string | number;
      }
      return next;
    });
    setLists((prev) => {
      const next = { ...prev };
      for (const d of drafts) {
        if (d.type === 'list') next[d.key] = clone(d.after as ContentListItem[]);
      }
      return next;
    });
    setSections((prev) => {
      const next = clone(prev);
      for (const d of drafts) {
        if (d.type !== 'section') continue;
        const target = next.find((s) => s.id === d.key);
        if (target) Object.assign(target, d.after as Partial<PageSection>);
      }
      return next;
    });
    setSettings((prev) => {
      const next = { ...prev };
      for (const d of drafts) {
        if (d.type !== 'settings') continue;
        const patch = d.after as Partial<SiteSettings>;
        Object.assign(next, patch);
        if (patch.seo) next.seo = { ...next.seo, ...patch.seo };
      }
      return next;
    });
    setCategories((prev) => {
      const hasCategory = drafts.some((d) => d.type === 'category');
      return hasCategory
        ? (drafts.find((d) => d.type === 'category')!.after as Category[])
        : prev;
    });

    setRevisions((prev) => [rev, ...prev]);
    setDrafts([]);
    return rev;
  }, [drafts]);

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

  const addMedia = useCallback((item: MediaItem) => {
    setMedia((prev) => [item, ...prev]);
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const restoreRevision = useCallback((rev: Revision) => {
    // Restore applies each change's "from" value as new live state and
    // records a fresh revision (per the approved plan).
    const updates: ValueMap = {};
    const listRows: { listKey: string; itemId: string; fieldKey: string; value: string }[] = [];
    for (const c of rev.changes) {
      if (c.key.startsWith('settings.')) continue;
      const m = /^(.+):([^:]+):(.+)$/.exec(c.key);
      if (m) {
        listRows.push({ listKey: m[1]!, itemId: m[2]!, fieldKey: m[3]!, value: c.from });
      } else {
        updates[c.key] = c.from;
      }
    }
    setValues((prev) => ({ ...prev, ...updates }));
    setLists((prev) => {
      if (listRows.length === 0) return prev;
      const next = { ...prev };
      for (const row of listRows) {
        const items = next[row.listKey];
        if (!items) continue;
        next[row.listKey] = items.map((it) =>
          it.id === row.itemId ? { ...it, fields: { ...it.fields, [row.fieldKey]: row.value } } : it
        );
      }
      return next;
    });
    setSettings((prev) => {
      const next = { ...prev, seo: { ...prev.seo } };
      for (const c of rev.changes) {
        if (!c.key.startsWith('settings.')) continue;
        const path = c.key.slice('settings.'.length);
        if (path === 'freeDeliveryOver') {
          const n = Number(c.from.replace(/[^0-9]/g, ''));
          if (Number.isFinite(n)) next.freeDeliveryOver = n;
        } else {
          const m = /^seo\.(\w+)\.(title|description)$/.exec(path);
          if (m) {
            const pageKey = m[1]! as keyof SiteSettings['seo'];
            next.seo[pageKey] = { title: '', description: '', ...next.seo[pageKey], [m[2]!]: c.from };
          }
        }
      }
      return next;
    });
    setRevisions((prev) => [
      {
        id: nextId('rev'),
        at: new Date().toISOString(),
        author: 'Studio',
        changes: rev.changes.map((c) => ({
          key: c.key,
          label: c.label,
          from: c.to,
          to: c.from,
        })),
      },
      ...prev,
    ]);
  }, []);

  const value = useMemo<ContentContextValue>(
    () => ({
      values,
      lists,
      sections,
      settings,
      categories,
      revisions,
      media,
      addMedia,
      removeMedia,
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
      addMedia,
      removeMedia,
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
