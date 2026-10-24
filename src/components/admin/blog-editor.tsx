'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Images } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { BodyEditor } from '@/components/admin/blog/body-editor';
import { MediaPicker } from '@/components/admin/workbench/media-picker';
import type { BlogPost, MediaItem } from '@/lib/types';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Studio practice', 'Materials', 'Wrapping', 'Events', 'Announcement'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface BlogEditorProps {
  initial: BlogPost | null; // null = new post
}

/**
 * Blog editor layout: full-width editor + 220px sidebar.
 * Slug rule (standard CMS behaviour): auto-generated from the title
 * on every keystroke until the admin edits the slug field manually,
 * after which it never auto-updates again.
 */
export function BlogEditor({ initial }: BlogEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(initial !== null);
  const [content, setContent] = useState(initial?.content ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]!);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [status, setStatus] = useState<BlogPost['status']>(initial?.status ?? 'draft');
  const [placeholder, setPlaceholder] = useState(initial?.placeholder ?? true);
  const [publishedAt, setPublishedAt] = useState(initial?.publishedAt ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const pickCover = (item: MediaItem) => {
    setCoverUrl(item.url);
    setPickerOpen(false);
  };

  const handleTitle = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSlug = (value: string) => {
    setSlugTouched(true); // first manual edit locks auto-generation
    setSlug(value);
  };

  const commitTags = (raw: string) => {
    const next = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (next.length) setTags((prev) => Array.from(new Set([...prev, ...next])));
    setTagDraft('');
  };

  const save = (nextStatus: BlogPost['status']) => {
    setStatus(nextStatus);
    if (nextStatus === 'published' && !publishedAt) {
      setPublishedAt(new Date().toISOString().slice(0, 10));
    }
    setNote(
      nextStatus === 'published'
        ? 'Published — mock only, nothing sent to a backend.'
        : 'Draft saved — mock only, nothing sent to a backend.'
    );
  };

  return (
    <div>
      <Link
        href="/admin/blog"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden />
        All posts
      </Link>

      <PageHeader
        title={initial ? 'Edit post' : 'New post'}
        subtitle={initial ? `ID ${initial.id}` : undefined}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Editor column */}
        <div className="min-w-0 flex-1">
          {/* Title — display serif, hairline bottom on focus */}
          <input
            value={title}
            onChange={(e) => handleTitle(e.target.value)}
            placeholder="Post title"
            aria-label="Post title"
            className="w-full border-b border-transparent bg-transparent pb-2 font-display text-[28px] leading-tight text-paper outline-none transition-colors placeholder:text-paper-40 focus:border-paper-40"
          />

          {/* Slug — mono, editable */}
          <div className="mt-2 flex items-center gap-2 font-mono text-xs text-paper-60">
            <span aria-hidden>/blog/</span>
            <input
              value={slug}
              onChange={(e) => handleSlug(e.target.value)}
              aria-label="Slug"
              className="min-w-0 flex-1 bg-transparent text-paper-70 outline-none placeholder:text-paper-40"
              placeholder="auto-generated-slug"
            />
          </div>

          <div className="mt-4">
            <BodyEditor value={content} onChange={setContent} />
          </div>
        </div>

        {/* Sidebar — 220px */}
        <aside className="w-full shrink-0 space-y-4 lg:w-[220px]">
          {/* Publish card */}
          <section className="card-admin p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                Status
              </span>
              <span className="font-mono text-[11px] text-paper">{status}</span>
            </div>
            {publishedAt && (
              <p className="mb-3 flex items-center gap-2 font-mono text-[11px] text-paper-60">
                {formatShortDate(publishedAt)}
                {placeholder && (
                  <span className="rounded-card border border-kraft-30 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-kraft-60">
                    Placeholder copy
                  </span>
                )}
              </p>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => save('draft')}
                className="btn-ghost-dark w-full"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => save('published')}
                className="btn-vermilion w-full"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() => setNote('Deleted — mock only, nothing removed from a backend.')}
                className="h-9 w-full rounded-card border border-vermilion/40 text-sm text-vermilion hover:bg-vermilion-20"
              >
                Delete
              </button>
            </div>
            {note && (
              <p role="status" className="mt-3 font-mono text-[11px] leading-snug text-moss-bright">
                {note}
              </p>
            )}
          </section>

          {/* Cover image */}
          <section className="card-admin p-3">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Cover
            </span>
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-kraft-12 font-display text-2xl text-kraft-60">
              {coverUrl ? 'Cover' : '—'}
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-card border border-line px-2 font-mono text-[10px] text-paper-70 hover:border-paper-40 hover:text-paper"
            >
              <Images size={13} aria-hidden />
              Choose from media
            </button>
          </section>

          {/* Category */}
          <section className="card-admin p-3">
            <label
              htmlFor="post-category"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Category
            </label>
            <select
              id="post-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-hairline"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </section>

          {/* Tags */}
          <section className="card-admin p-3">
            <label
              htmlFor="post-tags"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Tags
            </label>
            {tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-card border border-line px-1.5 py-0.5 font-mono text-[10px] text-paper-70"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                      className="text-paper-40 hover:text-vermilion"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              id="post-tags"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  commitTags(tagDraft);
                }
              }}
              onBlur={() => tagDraft && commitTags(tagDraft)}
              placeholder="Comma-separated"
              className="input-hairline"
            />
          </section>

          {/* Excerpt */}
          <section className="card-admin p-3">
            <label
              htmlFor="post-excerpt"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Excerpt
            </label>
            <textarea
              id="post-excerpt"
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="input-hairline resize-y"
            />
          </section>

          {/* Placeholder toggle */}
          <section className="card-admin flex items-center justify-between p-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Placeholder
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={placeholder}
              aria-label="Placeholder copy"
              onClick={() => setPlaceholder((v) => !v)}
              className={cn(
                'inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors',
                placeholder ? 'border-kraft bg-kraft-12' : 'border-line bg-bg'
              )}
            >
              <span
                className={cn(
                  'h-3.5 w-3.5 rounded-full transition-transform',
                  placeholder ? 'translate-x-4 bg-kraft' : 'translate-x-0 bg-paper-40'
                )}
              />
            </button>
          </section>
        </aside>
      </div>

      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={pickCover} />
    </div>
  );
}
