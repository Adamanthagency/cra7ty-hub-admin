'use client';

import { ProductEditor } from '@/components/admin/product-editor';
import type { Product } from '@/lib/types';

/** Blank product scaffold for the new-product route. `position: 0` is the
 *  sentinel the API reads as "append to the end of the shelf" — the client
 *  never sets shelf order. */
const blankProduct: Product = {
  id: 'new',
  slug: '',
  name: '',
  description: '',
  category: 'origami',
  price: 0,
  model: 'crane',
  detail: [],
  specs: [],
  stock: 0,
  status: 'inactive',
  variants: [],
  tags: [],
  images: [],
  position: 0,
  updatedAt: new Date().toISOString(),
};

export default function NewProductPage() {
  return <ProductEditor initial={blankProduct} mode="new" />;
}
