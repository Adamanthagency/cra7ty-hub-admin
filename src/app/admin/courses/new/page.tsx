'use client';

import { CourseEditor } from '@/components/admin/course-editor';
import type { Product } from '@/lib/types';

/**
 * Blank course scaffold for the new-course route.
 *
 * `category` and `productType` are set here and re-pinned on every save
 * inside CourseEditor, so a course can never be created as anything but a
 * digital product in the `courses` category. `position: 0` is the sentinel
 * the API reads as "append to the end" — the client never sets order.
 * `stock: 0` because digital rows are never stock-tracked.
 */
const blankCourse: Product = {
  id: 'new',
  slug: '',
  name: '',
  description: '',
  category: 'courses',
  price: 0,
  model: 'crane',
  detail: [],
  specs: [],
  stock: 0,
  status: 'inactive',
  productType: 'digital',
  downloadFiles: [],
  variants: [],
  tags: [],
  images: [],
  position: 0,
  updatedAt: new Date().toISOString(),
};

export default function NewCoursePage() {
  return <CourseEditor initial={blankCourse} mode="new" />;
}
