'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { posts as seed } from '@/data/mock/posts';
import { deletePost, fetchPosts } from '@/lib/catalog-api';
import type { BlogPost, PostStatus } from '@/lib/types';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

function wordCount(post: BlogPost): number {
  const trimmed = post.content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function BlogPage() {
  const router = useRouter();
  // Instant paint from the seed, then hydrate — the table is the truth.
  const [posts, setPosts] = useState<BlogPost[]>(seed);
  const [liveStatus, setLiveStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tab, setTab] = useState<PostStatus>('published');

  useEffect(() => {
    let cancelled = false;
    fetchPosts()
      .then((rows) => {
        if (cancelled) return;
        setPosts(rows);
        setLiveStatus('live');
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLiveStatus('offline');
        setLiveError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Delete on the server first; the row only leaves the list on success. */
  const remove = async (id: string) => {
    setSaveError(null);
    try {
      await deletePost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const counts = useMemo(
    () => ({
      published: posts.filter((p) => p.status === 'published').length,
      draft: posts.filter((p) => p.status === 'draft').length,
    }),
    [posts]
  );

  const visible = useMemo(
    () =>
      posts
        .filter((p) => p.status === tab)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [posts, tab]
  );

  return (
    <div>
      <PageHeader
        title="Blog"
        subtitle={`${posts.length} posts`}
        right={
          <Link href="/admin/blog/new" className="btn-vermilion">
            <Plus size={15} aria-hidden />
            New post
          </Link>
        }
      />

      {/* Live status — never let a local-only list pretend to be the blog */}
      {liveStatus === 'loading' && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">Loading live posts…</p>
      )}
      {liveStatus === 'live' && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">
          Live — these are the rows /blog reads.
        </p>
      )}
      {liveStatus === 'offline' && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          Could not reach the server — showing the local copy ({liveError}).
          Nothing here has been saved to the blog.
        </p>
      )}
      {saveError && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          {saveError}
        </p>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Post status" className="mb-4 flex gap-1">
        {(['published', 'draft'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-card border px-3 font-mono text-[11px] transition-colors',
              tab === t
                ? 'border-vermilion text-vermilion'
                : 'border-line text-paper-60 hover:border-paper-40 hover:text-paper'
            )}
          >
            {t === 'published' ? 'Published' : 'Drafts'}
            <span className="tabular-nums text-paper-40">{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="card-admin overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center font-mono text-xs text-paper-60">
            No {tab === 'draft' ? 'drafts' : 'published posts'}.
          </p>
        ) : (
          <ul>
            {visible.map((post) => (
              <li
                key={post.id}
                className="flex items-center gap-4 border-b border-line/60 px-4 py-3.5 transition-colors last:border-0 hover:bg-paper-12"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/admin/blog/${post.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-paper">
                      {post.title}
                    </span>
                    <span className="rounded-card border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-paper-60">
                      {post.category}
                    </span>
                    {post.placeholder && (
                      <span className="rounded-card border border-kraft-30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-kraft-60">
                        Placeholder copy
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-paper-60">
                    {post.excerpt}
                  </span>
                </button>

                <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-paper-60 sm:block">
                  {wordCount(post)} words
                </span>
                <span className="hidden shrink-0 font-mono text-[11px] text-paper-60 md:block">
                  {post.status === 'published' && post.publishedAt
                    ? formatShortDate(post.publishedAt)
                    : 'Draft'}
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${post.title}`}
                    onClick={() => router.push(`/admin/blog/${post.id}`)}
                    className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${post.title}`}
                    onClick={() => void remove(post.id)}
                    className="rounded-card p-2 text-paper-60 hover:bg-vermilion-20 hover:text-vermilion"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
