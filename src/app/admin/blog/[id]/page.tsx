'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BlogEditor } from '@/components/admin/blog-editor';
import { fetchPosts } from '@/lib/catalog-api';
import type { BlogPost } from '@/lib/types';

/**
 * Edit route for one post. Hydrated from the live table (mock seeds are
 * only the offline fallback), so a post created in the admin opens here
 * even when the seed never listed it.
 */
export default function EditPostPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPosts()
      .then((rows) => {
        if (cancelled) return;
        setPost(rows.find((p) => p.id === params.id) ?? null);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return <p className="font-mono text-[11px] text-paper-40">Loading live post…</p>;
  }

  if (error) {
    return (
      <div>
        <p role="alert" className="mb-3 font-mono text-[11px] text-vermilion">
          Could not reach the server — {error}
        </p>
        <Link href="/admin/blog" className="btn-ghost-dark inline-flex items-center gap-1.5">
          <ArrowLeft size={13} aria-hidden />
          Back to blog
        </Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">No post with id “{params.id}”.</p>
        <Link href="/admin/blog" className="btn-ghost-dark mt-4">
          Back to blog
        </Link>
      </div>
    );
  }

  return <BlogEditor initial={post} />;
}
