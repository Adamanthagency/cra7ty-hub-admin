'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProductEditor } from '@/components/admin/product-editor';
import { products } from '@/data/mock/products';

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const product = products.find((p) => p.id === params.id);

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
