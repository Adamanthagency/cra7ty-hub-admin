'use client';

import { notFound, useParams } from 'next/navigation';
import { pages } from '@/data/mock/pages';
import { VisualEditor } from '@/components/admin/visual/visual-editor';

/**
 * Click-to-edit Visual editor for one page: the real storefront framed
 * inside the admin, with a side panel for editing. Unknown page keys
 * 404 exactly like the sections screen.
 */
export default function VisualEditorRoute() {
  const params = useParams<{ page: string }>();
  const page = pages.find((p) => p.key === params.page);

  if (!page) notFound();

  return <VisualEditor page={page} />;
}
