'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BlogEditor } from '@/components/admin/blog-editor';
import { posts } from '@/data/mock/posts';

export default function EditPostPage() {
  const params = useParams<{ id: string }>();
  const post = posts.find((p) => p.id === params.id);

  if (!post) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">
          No post with id “{params.id}”.
        </p>
        <Link href="/admin/blog" className="btn-ghost-dark mt-4">
          Back to blog
        </Link>
      </div>
    );
  }

  return <BlogEditor initial={post} />;
}
