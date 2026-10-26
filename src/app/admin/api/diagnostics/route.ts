import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  probeConnection,
  urlEnvName,
} from '@/lib/server/content-store';

/**
 * Connection diagnostics for the deployed admin: which env vars the code
 * actually reads, whether each is set, and whether the service key can
 * read Supabase — as booleans and short status text, NEVER the values.
 *
 * Same guard as the other admin API routes: /admin/api/* skips the
 * middleware, so requireAdmin (real Supabase session check) runs here.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  const base = {
    /** URL accepted from either literal name; the value is never shown */
    supabaseUrlSet: urlEnvName() !== null,
    urlEnvName: urlEnvName(),
    serviceKeySet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    problem,
    checkedAt: new Date().toISOString(),
  };

  if (problem) {
    return NextResponse.json({
      ...base,
      canConnect: false,
      connectHttpStatus: null,
      connectDetail: 'skipped — configuration is incomplete',
    });
  }

  const probe = await probeConnection();
  return NextResponse.json({
    ...base,
    canConnect: probe.ok,
    connectHttpStatus: probe.httpStatus,
    connectDetail: probe.detail,
  });
}
