'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Images } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { BodyEditor } from '@/components/admin/blog/body-editor';
import { MediaPicker } from '@/components/admin/workbench/media-picker';
import { MediaImg } from '@/components/admin/media-img';
import type { BlogPost, MediaItem, ModelKey } from '@/lib/types';
import { deletePost, fetchProducts, savePost } from '@/lib/catalog-api';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Studio practice', 'Materials', 'Wrapping', 'Events', 'Announcement'];

const MODEL_OPTIONS: { value: ModelKey; label: string }[] = [
  { value: 'crane', label: 'Crane' },
  { value: 'plate', label: 'Plate' },
  { value: 'spoon', label: 'Spoon' },
  { value: 'box', label: 'Gift box' },
  { value: 'flower', label: 'Flower' },
  { value: 'cup', label: 'Cup' },
  { value: 'sheet', label: 'Paper sheet' },
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Two masked headline lines, split at the word boundary nearest the
 *  middle — the fallback when the admin leaves the field alone. */
function deriveTitleLines(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [title.trim()];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/** Reading-time estimate used when the field is left empty: 220 wpm. */
function estimateMinutes(markdown: string): number {
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 220));
}

interface BlogEditorProps {
  initial: BlogPost | null; // null = new post
}

/**
 * Blog editor layout: full-width editor + 220px sidebar.
 * Slug rule (standard CMS behaviour): auto-generated from the title
 * on every keystroke until the admin edits the slug field manually,
 * after which it never auto-updates again.
 *
 * Save writes ONE row to blog_posts through /admin/api/posts. A draft
 * saves with status='draft' and is filtered out of the storefront's
 * getPosts, so nothing unpublished can reach /blog; Publish sets the
 * status (and the first-published date), then the route asks the
 * storefront to revalidate on demand — the post shows within seconds
 * (the storefront's 300s timer is only the fallback for a failed
 * refresh call, which this editor reports).
 */
export function BlogEditor({ initial }: BlogEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(initial !== null);
  const [content, setContent] = useState(initial?.content ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [standfirst, setStandfirst] = useState(initial?.standfirst ?? '');
  const [titleLines, setTitleLines] = useState<string[]>(initial?.titleLines ?? []);
  const [titleLinesTouched, setTitleLinesTouched] = useState(
    (initial?.titleLines.length ?? 0) > 0
  );
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  /** 0 = “auto”, resolved from the body at save time. */
  const [minutes, setMinutes] = useState(initial?.minutes ?? 0);
  const [model, setModel] = useState<ModelKey>(initial?.model ?? 'crane');
  const [relatedProductIds, setRelatedProductIds] = useState<string[]>(
    initial?.relatedProductIds ?? []
  );
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]!);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [status, setStatus] = useState<BlogPost['status']>(initial?.status ?? 'draft');
  const [placeholder, setPlaceholder] = useState(initial?.placeholder ?? true);
  const [publishedAt, setPublishedAt] = useState(initial?.publishedAt ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.coverUrl ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteIsError, setNoteIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Candidates for the related-products strip (for new posts too). */
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((rows) => {
        if (!cancelled) setAllProducts(rows.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {
        // The picker simply has nothing to offer when the server is down;
        // saving surfaces its own error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRelated = (id: string) => {
    setRelatedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const pickCover = (item: MediaItem) => {
    setCoverUrl(item.url);
    setPickerOpen(false);
  };

  const handleTitle = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
    if (!titleLinesTouched) setTitleLines(deriveTitleLines(value));
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

  const save = async (nextStatus: BlogPost['status']) => {
    setNoteIsError(false);
    setNote(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setNoteIsError(true);
      setNote('The post needs a title before it can be saved.');
      return;
    }
    if (!SLUG_RE.test(slug.trim())) {
      setNoteIsError(true);
      setNote('The slug must be lowercase letters, numbers and dashes.');
      return;
    }
    if (!standfirst.trim()) {
      setNoteIsError(true);
      setNote('The post needs a standfirst — it sits under the title and in the page metadata.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setNoteIsError(true);
      setNote('The date must be YYYY-MM-DD.');
      return;
    }

    const lines = titleLines.map((line) => line.trim()).filter(Boolean);
    const finalLines = lines.length > 0 ? lines : deriveTitleLines(trimmedTitle);
    const today = new Date().toISOString().slice(0, 10);
    const payload: BlogPost = {
      // A new post gets its permanent id on first save; edits keep theirs.
      id: initial ? initial.id : `post-${crypto.randomUUID()}`,
      title: trimmedTitle,
      titleLines: finalLines,
      standfirst: standfirst.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim(),
      content,
      category,
      model,
      date,
      minutes: minutes > 0 ? minutes : estimateMinutes(content),
      relatedProductIds,
      tags,
      status: nextStatus,
      placeholder,
      coverUrl,
      publishedAt: nextStatus === 'published' ? (publishedAt ?? today) : null,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const result = await savePost(payload);
      setStatus(nextStatus);
      setPublishedAt(payload.publishedAt);
      const refreshed = result.revalidate;
      if (nextStatus === 'published' && refreshed && !refreshed.ok) {
        setNoteIsError(true);
        setNote(
          `Saved, but refreshing the live site failed — ${refreshed.error ?? 'unknown error'}. The blog will catch up within about 5 minutes.`
        );
      } else {
        setNote(
          nextStatus === 'published'
            ? refreshed
              ? `Published — the blog shows it now (site refreshed in ${refreshed.ms} ms).`
              : 'Published.'
            : 'Draft saved. Drafts never reach the live site.'
        );
      }
      if (!initial) router.push(`/admin/blog/${payload.id}`);
    } catch (error) {
      setNoteIsError(true);
      setNote((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** Delete is a real row removal — only offered on a saved post. */
  const remove = async () => {
    if (!initial) return;
    setNoteIsError(false);
    setNote(null);
    setSaving(true);
    try {
      await deletePost(initial.id);
      router.push('/admin/blog');
    } catch (error) {
      setNoteIsError(true);
      setNote((error as Error).message);
      setSaving(false);
    }
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
                onClick={() => void save('draft')}
                disabled={saving}
                className="btn-ghost-dark w-full disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => void save('published')}
                disabled={saving}
                className="btn-vermilion w-full disabled:opacity-50"
              >
                Publish
              </button>
              {initial && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                  className="h-9 w-full rounded-card border border-vermilion/40 text-sm text-vermilion hover:bg-vermilion-20 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
            {note && (
              <p
                role={noteIsError ? 'alert' : 'status'}
                className={cn(
                  'mt-3 font-mono text-[11px] leading-snug',
                  noteIsError ? 'text-vermilion' : 'text-moss-bright'
                )}
              >
                {note}
              </p>
            )}
          </section>

          {/* Cover image */}
          <section className="card-admin p-3">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Cover
            </span>
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-kraft-12 font-display text-2xl text-kraft-60">
              {coverUrl ? 'Cover' : '—'}
              {coverUrl?.startsWith('http') && (
                <MediaImg
                  src={coverUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
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

          {/* Standfirst — the line under the title and the page metadata */}
          <section className="card-admin p-3">
            <label
              htmlFor="post-standfirst"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Standfirst
            </label>
            <textarea
              id="post-standfirst"
              rows={3}
              value={standfirst}
              onChange={(e) => setStandfirst(e.target.value)}
              placeholder="One sentence under the title"
              className="input-hairline resize-y"
            />
          </section>

          {/* Headline lines — the masked headline on /blog/[slug] */}
          <section className="card-admin p-3">
            <label
              htmlFor="post-titlelines"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Headline lines
            </label>
            <textarea
              id="post-titlelines"
              rows={2}
              value={titleLines.join('\n')}
              onChange={(e) => {
                setTitleLinesTouched(true);
                setTitleLines(e.target.value.split('\n'));
              }}
              placeholder={'One line per row'}
              className="input-hairline resize-y font-mono text-xs"
            />
            <p className="mt-1 font-mono text-[10px] text-paper-50">
              Split from the title until you edit them.
            </p>
          </section>

          {/* Date, reading time, model */}
          <section className="card-admin space-y-3 p-3">
            <div>
              <label
                htmlFor="post-date"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Date
              </label>
              <input
                id="post-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-hairline font-mono"
              />
              <p className="mt-1 font-mono text-[10px] text-paper-50">Drives newest-first order.</p>
            </div>
            <div>
              <label
                htmlFor="post-minutes"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Reading time (min)
              </label>
              <input
                id="post-minutes"
                type="number"
                min={1}
                value={minutes > 0 ? minutes : ''}
                onChange={(e) => setMinutes(e.target.value === '' ? 0 : Number(e.target.value))}
                placeholder={`auto (~${estimateMinutes(content)})`}
                className="input-hairline font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="post-model"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Lead art model
              </label>
              <select
                id="post-model"
                value={model}
                onChange={(e) => setModel(e.target.value as ModelKey)}
                className="input-hairline"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Related products — the strip at the foot of the post */}
          <section className="card-admin p-3">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Related products
            </span>
            {allProducts.length === 0 ? (
              <p className="font-mono text-[10px] text-paper-50">Unavailable while offline.</p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {allProducts.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-paper-70 hover:text-paper">
                      <input
                        type="checkbox"
                        checked={relatedProductIds.includes(p.id)}
                        onChange={() => toggleRelated(p.id)}
                        className="mt-0.5 accent-vermilion"
                      />
                      {p.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
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
