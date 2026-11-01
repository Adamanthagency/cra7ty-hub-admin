'use client';

import { EventPostEditor } from '@/components/admin/event-post-editor';

/**
 * New event post — `initial: null` is the editor's new-row sentinel
 * (the BlogEditor convention): status starts as draft, and the post
 * gets its permanent id on first save. Nothing reaches /events until
 * Publish, which the editor gates on an image.
 */
export default function NewEventPostPage() {
  return <EventPostEditor initial={null} />;
}
