import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';

/** GET /admin/api/auth/me — who is signed in (real session check). */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ email: guard.email });
}
