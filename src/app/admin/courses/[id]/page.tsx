'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CourseEditor } from '@/components/admin/course-editor';
import { fetchProducts } from '@/lib/catalog-api';
import type { Product } from '@/lib/types';

/**
 * Edit route for one course, hydrated from the live products table. A
 * course is a product row, so it is found by the same fetch the list uses;
 * the id is not matched against the `courses` category here because a row
 * filed under courses while it was edited from Products should still open.
 */
export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const [course, setCourse] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((rows) => {
        if (cancelled) return;
        setCourse(rows.find((p) => p.id === params.id) ?? null);
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
    return <p className="font-mono text-[11px] text-paper-40">Loading live course…</p>;
  }

  if (error) {
    return (
      <div>
        <p role="alert" className="mb-3 font-mono text-[11px] text-vermilion">
          Could not reach the server — {error}
        </p>
        <Link href="/admin/courses" className="btn-ghost-dark inline-flex items-center gap-1.5">
          <ArrowLeft size={13} aria-hidden />
          Back to courses
        </Link>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">
          No course with id “{params.id}”.
        </p>
        <Link href="/admin/courses" className="btn-ghost-dark mt-4">
          Back to courses
        </Link>
      </div>
    );
  }

  return <CourseEditor initial={course} mode="edit" />;
}
