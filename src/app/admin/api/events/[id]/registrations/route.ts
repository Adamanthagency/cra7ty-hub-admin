import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem, loadRegistrations, loadWaitlist } from '@/lib/server/events-store';

/**
 * GET /admin/api/events/[id]/registrations — who paid, who is pending,
 * who is flagged and who is waiting, for one event. One endpoint, both
 * lists: the screen always shows the tabs together, and the counts are
 * the same numbers the events list already summarises.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  try {
    const [registrations, waitlist] = await Promise.all([
      loadRegistrations(params.id),
      loadWaitlist(params.id),
    ]);
    return NextResponse.json({ registrations, waitlist });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load registrations: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
