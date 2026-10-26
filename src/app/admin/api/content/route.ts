import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem, loadLiveContent } from '@/lib/server/content-store';

/**
 * The workbench's live-state hydration (Stage 4). Reads the four content
 * tables plus revisions with the service-role key, so the admin edits
 * exactly what the storefront serves.
 *
 * /admin/api/* skips the middleware guard, so this route checks the
 * session cookie itself and answers 401 without it (requireAdmin —
 * a real Supabase session check, not cookie presence).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

  try {
    return NextResponse.json(await loadLiveContent());
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load live content: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
