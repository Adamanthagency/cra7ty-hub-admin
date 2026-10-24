'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable, type Column } from '@/components/admin/data-table';
import { StatusChip } from '@/components/admin/status-chip';
import { productCategories, products as seed } from '@/data/mock/products';
import type { Product } from '@/lib/types';
import { formatNgn } from '@/lib/format';
import { cn } from '@/lib/utils';

function initials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lowStockOnly = searchParams.get('filter') === 'low-stock';

  // Local mock state — deletions and bulk changes live in component state.
  const [rows, setRows] = useState<Product[]>(seed);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>(
    lowStockOnly ? 'low' : 'all'
  );
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (stockFilter === 'low' && p.stock >= 5) return false;
      return true;
    });
  }, [rows, query, category, stockFilter]);

  const bulkSetStatus = (status: 'active' | 'inactive') => {
    setRows((prev) =>
      prev.map((p) => (selected.includes(p.id) ? { ...p, status } : p))
    );
    setSelected([]);
  };

  const bulkDelete = () => {
    setRows((prev) => prev.filter((p) => !selected.includes(p.id)));
    setSelected([]);
  };

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
          href={`/admin/products/${p.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-paper hover:underline"
        >
          {p.name}
        </Link>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) => <span className="capitalize text-paper-70">{p.category}</span>,
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
      key: 'stock',
      header: 'Stock',
      align: 'right',
      sort: (a, b) => a.stock - b.stock,
      render: (p) => (
        <span
          className={cn(
            'font-mono text-xs tabular-nums',
            p.stock < 5 ? 'text-vermilion' : 'text-paper-70'
          )}
        >
          {p.stock}
        </span>
      ),
    },
    {
      key: 'variants',
      header: 'Variants',
      align: 'right',
      render: (p) => (
        <span className="inline-block rounded-card border border-line px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-paper-70">
          {p.variants.length}
        </span>
      ),
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
            href={`/admin/products/${p.id}`}
            aria-label={`Edit ${p.name}`}
            className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
          >
            <Pencil size={14} />
          </Link>
          <button
            type="button"
            aria-label={`Delete ${p.name}`}
            onClick={() => setRows((prev) => prev.filter((x) => x.id !== p.id))}
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
        title="Products"
        subtitle={`${rows.length} products`}
        right={
          <Link href="/admin/products/new" className="btn-vermilion">
            <Plus size={15} aria-hidden />
            New product
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="input-hairline w-full sm:w-64"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="input-hairline w-auto"
        >
          <option value="all">All categories</option>
          {productCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div
          role="group"
          aria-label="Stock filter"
          className="inline-flex rounded-card border border-line p-0.5"
        >
          {(['all', 'low'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setStockFilter(mode)}
              aria-pressed={stockFilter === mode}
              className={cn(
                'rounded-[3px] px-3 py-1.5 font-mono text-[11px] transition-colors',
                stockFilter === mode
                  ? 'bg-paper-12 text-paper'
                  : 'text-paper-60 hover:text-paper'
              )}
            >
              {mode === 'all' ? 'All' : 'Low stock'}
            </button>
          ))}
        </div>
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
              Set active
            </button>
            <button
              type="button"
              onClick={() => bulkSetStatus('inactive')}
              className="rounded-card border border-line px-2.5 py-1 font-mono text-[11px] text-paper-70 hover:text-paper"
            >
              Set inactive
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
        onRowClick={(p) => router.push(`/admin/products/${p.id}`)}
        emptyMessage="No products match these filters."
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsContent />
    </Suspense>
  );
}
