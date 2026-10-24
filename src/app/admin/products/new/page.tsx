'use client';

import { ProductEditor } from '@/components/admin/product-editor';
import type { Product } from '@/lib/types';

/** Blank product scaffold for the new-product route. */
const blankProduct: Product = {
  id: 'new',
  name: '',
  description: '',
  category: 'origami',
  price: 0,
  stock: 0,
  status: 'inactive',
  variants: [],
  tags: [],
  images: [],
  updatedAt: new Date().toISOString(),
};

export default function NewProductPage() {
  return <ProductEditor initial={blankProduct} mode="new" />;
}
