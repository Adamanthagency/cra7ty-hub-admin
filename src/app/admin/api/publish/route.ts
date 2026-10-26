import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem, savePublish } from '@/lib/server/content-store';
import { revalidateStorefront } from '@/lib/server/revalidate';
import type { PublishPayload } from '@/lib/publish-api';

/**
 * The one write path (Stage 4). Validates the payload's SHAPE (the
 * service role bypasses RLS, so nothing unvalidated reaches the RPC),
 * then calls Supabase's `apply_publish`: one atomic transaction that
 * replaces the four content tables and inserts the revision.
 *
 * /admin/api/* skips the middleware guard, so this route runs its own
 * real session check (requireAdmin).
 */
export const dynamic = 'force-dynamic';

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) {
    return NextResponse.json(
      {
        error: problem,
        hint: 'Set the variable in Vercel → Project → Settings → Environment Variables (Production), then redeploy.',
      },
      { status: 503 },
    );
  }

  const payload = (await request.json().catch(() => null)) as PublishPayload | null;
  if (!payload || typeof payload !== 'object') return badRequest('Expected a JSON payload.');
  const { values, lists, sections, settings, categories, revision } = payload;

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return badRequest('`values` must be an object of key → value.');
  }
  if (!lists || typeof lists !== 'object' || Array.isArray(lists)) {
    return badRequest('`lists` must be an object of listKey → items.');
  }
  if (!Array.isArray(sections)) return badRequest('`sections` must be an array.');
  if (!Array.isArray(categories)) {
    return badRequest('`categories` must be an array of category rows.');
  }
  const seenCategoryIds = new Set<string>();
  for (const category of categories) {
    if (
      typeof category?.id !== 'string' ||
      typeof category?.index !== 'string' ||
      typeof category?.name !== 'string' ||
      typeof category?.blurb !== 'string'
    ) {
      return badRequest('Every category needs id, index, name and blurb strings.');
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.id)) {
      return badRequest(
        `Category id "${category.id}" must be a slug (lowercase letters, digits and dashes) — it is the /shop?category=… value.`,
      );
    }
    if (seenCategoryIds.has(category.id)) {
      return badRequest(`Duplicate category id "${category.id}" — every category needs a unique id.`);
    }
    seenCategoryIds.add(category.id);
  }
  if (
    !settings ||
    typeof settings !== 'object' ||
    typeof settings.siteName !== 'string' ||
    typeof settings.freeDeliveryOver !== 'number'
  ) {
    return badRequest('`settings` is missing required fields.');
  }
  if (
    !revision ||
    typeof revision.id !== 'string' ||
    typeof revision.at !== 'string' ||
    typeof revision.author !== 'string' ||
    !Array.isArray(revision.changes)
  ) {
    return badRequest('`revision` must carry id, at, author and changes[].');
  }
  for (const [listKey, items] of Object.entries(lists)) {
    if (!Array.isArray(items)) return badRequest(`List "${listKey}" is not an array.`);
  }
  for (const section of sections) {
    if (typeof section?.id !== 'string' || typeof section?.position !== 'number') {
      return badRequest('Every section needs an id and a numeric position.');
    }
  }

  try {
    await savePublish(payload);
    // The write is committed; now refresh the storefront immediately
    // (instant-publish). Failure is reported, never fatal — the
    // storefront's 300s timer remains the safety net.
    const revalidate = await revalidateStorefront({
      paths: ['/', '/shop', '/about', '/blog'],
      tags: [
        'db:content_values',
        'db:content_list_items',
        'db:site_settings',
        'db:page_sections',
        'db:categories',
      ],
    });
    return NextResponse.json({ ok: true, revisionId: revision.id, revalidate });
  } catch (error) {
    return NextResponse.json(
      { error: `Publish transaction failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
