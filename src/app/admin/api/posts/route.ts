import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  deleteRow,
  loadPosts,
  savePost,
  SlugConflictError,
  validatePost,
} from '@/lib/server/catalog-store';
import { revalidateStorefront } from '@/lib/server/revalidate';

/**
 * The Blog manager's write path (backend wiring: Products & Blog).
 *
 * GET    → every post, newest first (hydration; replaces the mock seed)
 * POST   → validate the payload's SHAPE, then upsert exactly one row
 * DELETE → ?id= removes exactly one row
 *
 * Session cookie checked here (the middleware skips /admin/api/*), the
 * service-role key stays server-side, and the markdown `content` is stored
 * as `body` — an array of markdown blocks (bodyFromMarkdown).
 *
 * A draft saves with status='draft' and is filtered out by the storefront's
 * getPosts, so nothing unpublished can reach the live site.
 */
export const dynamic = 'force-dynamic';

function unconfigured(problem: string) {
  return NextResponse.json(
    {
      error: problem,
      hint: 'Set the variable in Vercel → Project → Settings → Environment Variables (Production), then redeploy.',
    },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return unconfigured(problem);

  try {
    return NextResponse.json({ posts: await loadPosts() });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load posts: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return unconfigured(problem);

  const payload = (await request.json().catch(() => null)) as unknown;
  const result = validatePost(payload);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await savePost(result.post);
    // Committed → refresh the storefront now (instant-publish); the tag
    // purge also covers an old detail page after a slug rename.
    const revalidate = await revalidateStorefront({
      paths: ['/', '/blog', `/blog/${result.post.slug}`],
      tags: ['db:blog_posts'],
    });
    return NextResponse.json({
      ok: true,
      id: result.post.id,
      slug: result.post.slug,
      revalidate,
    });
  } catch (error) {
    if (error instanceof SlugConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: `Save failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return unconfigured(problem);

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing ?id=.' }, { status: 400 });

  try {
    const removed = await deleteRow('blog_posts', id);
    if (!removed) return NextResponse.json({ error: 'No post with that id.' }, { status: 404 });
    const revalidate = await revalidateStorefront({
      paths: ['/', '/blog'],
      tags: ['db:blog_posts'],
    });
    return NextResponse.json({ ok: true, id, revalidate });
  } catch (error) {
    return NextResponse.json(
      { error: `Delete failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
