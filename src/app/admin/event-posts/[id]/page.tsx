'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EventPostEditor } from '@/components/admin/event-post-editor';
import { fetchEventPosts } from '@/lib/event-posts-api';
import type { EventPost } from '@/lib/types';

/**
 * Edit route for one event post, hydrated from the live table (no seed
 * fallback — an announcement created in the admin always opens here).
 */
export default function EditEventPostPage() {
  const params = useParams<{ id: string }>();
  const [post, setPost] = useState<EventPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchEventPosts()
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
    return <p className="font-mono text-[11px] text-paper-40">Loading live event post…</p>;
  }

  if (error) {
    return (
      <div>
        <p role="alert" className="mb-3 font-mono text-[11px] text-vermilion">
          Could not reach the server — {error}
        </p>
        <Link
          href="/admin/event-posts"
          className="btn-ghost-dark inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={13} aria-hidden />
          Back to event posts
        </Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">
          No event post with id “{params.id}”.
        </p>
        <Link href="/admin/event-posts" className="btn-ghost-dark mt-4">
          Back to event posts
        </Link>
      </div>
    );
  }

  return <EventPostEditor initial={post} />;
}
