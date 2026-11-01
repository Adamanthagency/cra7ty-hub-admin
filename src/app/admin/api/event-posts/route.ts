import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  deleteRow,
  loadEventPosts,
  saveEventPost,
  validateEventPost,
} from '@/lib/server/catalog-store';
import { revalidateStorefront } from '@/lib/server/revalidate';

/**
 * The Event posts manager's write path (the public Events announcement
 * feed) — same conventions as /admin/api/posts.
 *
 * GET    → every event post, newest announced date first (hydration)
 * POST   → validate the payload's SHAPE, then upsert exactly one row
 * DELETE → ?id= removes exactly one row
 *
 * Session cookie checked here (the middleware skips /admin/api/*), the
 * service-role key stays server-side. A draft saves with
 * status='draft' and is filtered out by the storefront's
 * getEventPosts AND by the table's own published-only RLS policy, so
 * nothing unpublished can reach /events.
 *
 * SEPARATE FROM TIER 6: this route never touches events,
 * event_registrations or event_waitlist — registration and payment
 * stay entirely on the /workshops pages a post may link to.
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
    return NextResponse.json({ eventPosts: await loadEventPosts() });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load event posts: ${(error as Error).message}` },
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
  const result = validateEventPost(payload);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await saveEventPost(result.post);
    // Committed → refresh the storefront now; the db:event_posts tag
    // purge covers /events (the only route that reads this table).
    const revalidate = await revalidateStorefront({
      paths: ['/events'],
      tags: ['db:event_posts'],
    });
    return NextResponse.json({
      ok: true,
      id: result.post.id,
      revalidate,
    });
  } catch (error) {
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
    const removed = await deleteRow('event_posts', id);
    if (!removed) return NextResponse.json({ error: 'No event post with that id.' }, { status: 404 });
    const revalidate = await revalidateStorefront({
      paths: ['/events'],
      tags: ['db:event_posts'],
    });
    return NextResponse.json({ ok: true, id, revalidate });
  } catch (error) {
    return NextResponse.json(
      { error: `Delete failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
