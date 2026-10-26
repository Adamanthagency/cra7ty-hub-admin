import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem } from '@/lib/server/content-store';
import {
  deleteMedia,
  loadMedia,
  MediaValidationError,
  uploadMediaBatch,
} from '@/lib/server/media-store';

/**
 * The media library's write path (backend wiring: Stage 6;
 * multi-file in the mandatory-photos stage).
 *
 * GET    → every media row, newest first (hydration)
 * POST   → multipart form with 1–6 `files` parts (a lone `file` part is
 *          accepted too): every file is validated, bytes → Storage
 *          bucket `media`, rows → `media` table, items back as JSON.
 *          All-or-nothing: a failed batch stores nothing.
 * DELETE → ?id= removes the object AND the row
 *
 * /admin/api/* skips the middleware guard, so this route runs the real
 * Supabase session check itself (requireAdmin) and answers 401 without
 * it — same contract as the content, publish, products and posts routes.
 */
export const dynamic = 'force-dynamic';

async function guard(request: NextRequest): Promise<NextResponse | null> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
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
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadMedia());
  } catch (error) {
    return NextResponse.json(
      { error: `Could not load the media library: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll('files') ?? []).filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );
  // The single-file field name still works, so older callers don't break.
  if (files.length === 0) {
    const legacy = form?.get('file');
    if (legacy instanceof File && legacy.size > 0) files.push(legacy);
  }
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'Attach one to six images as the form field “files”.' },
      { status: 400 },
    );
  }

  try {
    const items = await uploadMediaBatch(files);
    return NextResponse.json({ items }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Upload failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing ?id=.' }, { status: 400 });
  }

  try {
    const removed = await deleteMedia(id);
    if (!removed) {
      return NextResponse.json({ error: `No media item with id ${id}.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Delete failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
