import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  deletePromoCode,
  loadPromoCodes,
  savePromoCode,
} from '@/lib/server/orders-store';
import type { PromoCode } from '@/lib/types';

/**
 * Promo codes manager (the admin face of the coupon_codes table the
 * checkout validates against).
 *
 * GET    → every code, newest first
 * POST   → validate + upsert exactly one row (id decides create vs edit)
 * DELETE → ?id= removes exactly one row
 *
 * usage_count is never accepted from the client — the payment
 * confirmation path owns it — so a save can never fake redemptions.
 * Codes are stored UPPERCASE (the table enforces it too).
 */
export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^[A-Z0-9_-]{2,40}$/;

function validate(input: unknown): { error: string } | { promo: PromoCode } {
  if (!input || typeof input !== 'object') {
    return { error: 'Expected a JSON object.' };
  }
  const raw = input as Record<string, unknown>;

  const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
  if (!CODE_PATTERN.test(code)) {
    return { error: 'Code must be 2–40 characters: letters, numbers, - or _.' };
  }

  const type = raw.type === 'flat' ? 'flat' : raw.type === 'percentage' ? 'percentage' : null;
  if (!type) return { error: 'Type must be "percentage" or "flat".' };

  const value = raw.value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return { error: 'Value must be a positive whole number.' };
  }
  if (type === 'percentage' && value > 100) {
    return { error: 'A percentage discount cannot exceed 100.' };
  }

  const usageLimit =
    raw.usageLimit === undefined || raw.usageLimit === null || raw.usageLimit === ''
      ? undefined
      : Number(raw.usageLimit);
  if (usageLimit !== undefined && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
    return { error: 'Usage limit must be a positive whole number, or empty.' };
  }

  const minOrderAmount =
    raw.minOrderAmount === undefined || raw.minOrderAmount === null || raw.minOrderAmount === ''
      ? undefined
      : Number(raw.minOrderAmount);
  if (minOrderAmount !== undefined && (!Number.isInteger(minOrderAmount) || minOrderAmount < 0)) {
    return { error: 'Minimum order amount must be 0 or more, or empty.' };
  }

  const expiresAt = typeof raw.expiresAt === 'string' ? raw.expiresAt.trim() : '';
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    return { error: 'Expiry must be a date (YYYY-MM-DD), or empty for never.' };
  }

  // coupon_codes.id is a uuid column — ids must be plain UUIDs.
  const id = typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID();

  return {
    promo: {
      id,
      code,
      type,
      value,
      // usageCount is not client-writable; the store never persists it
      // for edits and new rows start at the DB default.
      usageCount: typeof raw.usageCount === 'number' ? raw.usageCount : 0,
      usageLimit,
      expiresAt,
      minOrderAmount,
      active: raw.active !== false,
    },
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  try {
    return NextResponse.json({ promoCodes: await loadPromoCodes() });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load promo codes: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const body = await request.json().catch(() => null);
  const result = validate(body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await savePromoCode(result.promo);
    return NextResponse.json({ promo: result.promo });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not save the promo code: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const problem = configProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.length > 100) {
    return NextResponse.json({ error: 'Missing ?id=.' }, { status: 400 });
  }

  const deleted = await deletePromoCode(id);
  if (!deleted) {
    return NextResponse.json({ error: 'No such promo code.' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
