'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable, type Column } from '@/components/admin/data-table';
import { StatusChip } from '@/components/admin/status-chip';
import { deleteProduct, fetchProducts, saveProduct } from '@/lib/catalog-api';
import type { Product } from '@/lib/types';
import { formatNgn } from '@/lib/format';

/**
 * The Courses list — a dedicated section, not a filter tab on Products.
 *
 * It reads the SAME products table through the SAME /admin/api/products
 * route, but only ever shows rows filed under the `courses` category (the
 * id /courses filters on). Everything a client would manage from here —
 * create, rename, price, attach files, publish, delete — is this list plus
 * the CourseEditor; there is no product-only concept (variants, stock,
 * category picker) to expose.
 *
 * The category is never a column here: every row is a course by
 * definition, so showing it would be noise.
 */

/** The category id the storefront's /courses page filters on. */
const COURSES_CATEGORY = 'courses';

function initials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function CoursesContent() {
  const router = useRouter();

  // Every row starts as "not a course" (the seed holds none), so the list
  // is honestly empty until the live table answers — the database is the
  // source of truth and there is no seed fallback to paint.
  const [rows, setRows] = useState<Product[]>([]);
  const [liveStatus, setLiveStatus] = useState<'loading' | 'live' | 'offline'>('loading');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((products) => {
        if (cancelled) return;
        setRows(products.filter((p) => p.category === COURSES_CATEGORY));
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

  /** Delete on the server first; the local row only leaves on success. */
  const removeRows = async (ids: string[]) => {
    setSaveError(null);
    try {
      await Promise.all(ids.map((id) => deleteProduct(id)));
      setRows((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelected([]);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const bulkSetStatus = async (status: 'active' | 'inactive') => {
    setSaveError(null);
    const chosen = rows.filter((p) => selected.includes(p.id));
    try {
      await Promise.all(
        chosen.map((p) => saveProduct({ ...p, status, updatedAt: new Date().toISOString() })),
      );
      setRows((prev) =>
        prev.map((p) => (selected.includes(p.id) ? { ...p, status } : p)),
      );
      setSelected([]);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const bulkDelete = () => removeRows(selected);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const columns: Column<Product>[] = [
    {
      key: 'thumb',
      header: '',
      render: (p) => (
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-card bg-kraft font-mono text-xs font-medium text-ink"
        >
          {initials(p.name)}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sort: (a, b) => a.name.localeCompare(b.name),
      render: (p) => (
        <Link
          href={`/admin/courses/${p.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-paper hover:underline"
        >
          {p.name}
        </Link>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sort: (a, b) => a.price - b.price,
      render: (p) => (
        <span className="font-mono text-xs tabular-nums text-paper">
          {formatNgn(p.price)}
        </span>
      ),
    },
    {
      key: 'files',
      header: 'Files',
      align: 'right',
      sort: (a, b) => (a.downloadFiles?.length ?? 0) - (b.downloadFiles?.length ?? 0),
      render: (p) => {
        const count = p.downloadFiles?.length ?? 0;
        return (
          <span
            className={
              count === 0
                ? 'font-mono text-xs tabular-nums text-vermilion'
                : 'font-mono text-xs tabular-nums text-paper-70'
            }
          >
            {count}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusChip status={p.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (p) => (
        <span
          className="inline-flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/admin/courses/${p.id}`}
            aria-label={`Edit ${p.name}`}
            className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
          >
            <Pencil size={14} />
          </Link>
          <button
            type="button"
            aria-label={`Delete ${p.name}`}
            onClick={() => void removeRows([p.id])}
            className="rounded-card p-2 text-paper-60 hover:bg-vermilion-20 hover:text-vermilion"
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={`${rows.length} course${rows.length === 1 ? '' : 's'}`}
        right={
          <Link href="/admin/courses/new" className="btn-vermilion">
            <Plus size={15} aria-hidden />
            New course
          </Link>
        }
      />

      {/* Live status — never let a local-only list pretend to be the site */}
      {liveStatus === 'loading' && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">
          Loading live courses…
        </p>
      )}
      {liveStatus === 'live' && (
        <p className="mb-4 font-mono text-[11px] text-paper-40">
          Live — these are the rows the courses page reads.
        </p>
      )}
      {liveStatus === 'offline' && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          Could not reach the server — showing the local copy ({liveError}).
          Nothing here has been saved to the site.
        </p>
      )}
      {saveError && (
        <p role="alert" className="mb-4 font-mono text-[11px] text-vermilion">
          {saveError}
        </p>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          aria-label="Search courses"
          className="input-hairline w-full sm:w-64"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(p) => p.id}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        bulkBar={
          <>
            <button
              type="button"
              onClick={() => bulkSetStatus('active')}
              className="rounded-card border border-line px-2.5 py-1 font-mono text-[11px] text-paper-70 hover:text-paper"
            >
              Publish
            </button>
            <button
              type="button"
              onClick={() => bulkSetStatus('inactive')}
              className="rounded-card border border-line px-2.5 py-1 font-mono text-[11px] text-paper-70 hover:text-paper"
            >
              Unpublish
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className="rounded-card border border-vermilion/50 px-2.5 py-1 font-mono text-[11px] text-vermilion hover:bg-vermilion-20"
            >
              Delete
            </button>
          </>
        }
        onRowClick={(p) => router.push(`/admin/courses/${p.id}`)}
        emptyMessage={
          rows.length === 0
            ? 'No courses yet — create the first one.'
            : 'No courses match this search.'
        }
      />
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={null}>
      <CoursesContent />
    </Suspense>
  );
}
