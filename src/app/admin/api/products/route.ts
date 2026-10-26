import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import {
  configProblem,
  deleteRow,
  loadProducts,
  saveProduct,
  SlugConflictError,
  validateProduct,
} from '@/lib/server/catalog-store';
import { revalidateStorefront } from '@/lib/server/revalidate';

/**
 * The Products manager's write path (backend wiring: Products & Blog).
 *
 * GET    → every product, in shelf order (hydration; replaces the mock seed)
 * POST   → validate the payload's SHAPE, then upsert exactly one row
 * DELETE → ?id= removes exactly one row
 *
 * /admin/api/* skips the middleware guard, so this route runs the real
 * Supabase session check itself via requireAdmin, exactly like
 * /admin/api/content. The service-role key lives in the server env
 * (content-store.ts) and is never sent to the browser.
 *
 * Saving is a single-row upsert: it can never clobber other products, and
 * position is resolved server-side (see catalog-store).
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
    return NextResponse.json({ products: await loadProducts() });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load products: ${(error as Error).message}` },
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
  const result = validateProduct(payload);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    await saveProduct(result.product);
    // Committed → refresh the storefront now. The tag purge covers every
    // route that reads products (including an old detail page after a
    // slug rename); the paths are the headline routes.
    const revalidate = await revalidateStorefront({
      paths: ['/', '/shop', `/products/${result.product.slug}`],
      tags: ['db:products'],
    });
    return NextResponse.json({
      ok: true,
      id: result.product.id,
      slug: result.product.slug,
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
    const removed = await deleteRow('products', id);
    if (!removed) return NextResponse.json({ error: 'No product with that id.' }, { status: 404 });
    // The db:products tag purge also invalidates the deleted product's
    // detail page — every route depends on the products fetch.
    const revalidate = await revalidateStorefront({
      paths: ['/', '/shop'],
      tags: ['db:products'],
    });
    return NextResponse.json({ ok: true, id, revalidate });
  } catch (error) {
    return NextResponse.json(
      { error: `Delete failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
