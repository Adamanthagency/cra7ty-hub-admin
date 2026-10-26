'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ProductEditor } from '@/components/admin/product-editor';
import { fetchProducts } from '@/lib/catalog-api';
import type { Product } from '@/lib/types';

/**
 * Edit route for one product. Hydrated from the live table (mock seeds are
 * only the offline fallback), so a product created in the admin — or seeded
 * from the storefront — always opens here even when the seed never listed it.
 */
export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((rows) => {
        if (cancelled) return;
        setProduct(rows.find((p) => p.id === params.id) ?? null);
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
    return <p className="font-mono text-[11px] text-paper-40">Loading live product…</p>;
  }

  if (error) {
    return (
      <div>
        <p role="alert" className="mb-3 font-mono text-[11px] text-vermilion">
          Could not reach the server — {error}
        </p>
        <Link href="/admin/products" className="btn-ghost-dark inline-flex items-center gap-1.5">
          <ArrowLeft size={13} aria-hidden />
          Back to products
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="card-admin p-8 text-center">
        <p className="font-mono text-sm text-paper-60">
          No product with id “{params.id}”.
        </p>
        <Link href="/admin/products" className="btn-ghost-dark mt-4">
          Back to products
        </Link>
      </div>
    );
  }

  return <ProductEditor initial={product} mode="edit" />;
}
