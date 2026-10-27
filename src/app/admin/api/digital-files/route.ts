import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/admin-guard';
import { configProblem, supabaseFetch } from '@/lib/server/content-store';

/**
 * Digital file handling for the product editor (Tier 5).
 *
 * WHY A SIGNED UPLOAD URL RATHER THAN A NORMAL UPLOAD ROUTE:
 * Vercel caps a function's REQUEST BODY at 4.5 MB, so posting a 40 MB
 * PDF through a route handler answers 413 no matter what we do here.
 * The browser therefore uploads STRAIGHT to Supabase Storage: this route
 * only mints the short-lived upload URL, the file bytes never touch
 * Vercel, and Storage's own limits are the real ceiling.
 * (Verified against Vercel's docs: vercel.com/docs/functions/limitations)
 *
 * Three actions, all service-role, all behind requireAdmin:
 *   POST   { action:'sign',    productId, filename, sizeBytes }
 *          → { path, uploadUrl, uploadHeaders }  — the browser PUTs the
 *            file to uploadUrl with those headers, then calls 'confirm'.
 *   POST   { action:'confirm', path }
 *          → { path, filename, sizeBytes }       — re-reads the object
 *            server-side and ENFORCES the size ceiling the bucket cannot
 *            (this storage-api build rejects file_size_limit on create),
 *            deleting anything over the limit rather than returning it.
 *   DELETE ?path=                                 — remove an object
 *            (used when the editor clears a file).
 *
 * NEVER returns a permanent URL for the file: the object lives in the
 * PRIVATE `digital-files` bucket and is only ever reachable through the
 * signed links the storefront mints per order.
 */

export const dynamic = 'force-dynamic';

const BUCKET = 'digital-files';

/** Server-side ceiling — the bucket cannot hold one, so we enforce it. */
const MAX_BYTES = 100 * 1024 * 1024;

/** Must match the bucket's allowed_mime_types (see create-digital-bucket). */
const ALLOWED_MIME = new Map<string, string[]>([
  ['application/pdf', ['pdf']],
  ['application/zip', ['zip']],
  ['application/epub+zip', ['epub']],
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/webp', ['webp']],
  ['video/mp4', ['mp4']],
  ['audio/mpeg', ['mp3']],
]);

async function guard(request: NextRequest): Promise<NextResponse | null> {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const problem = configProblem();
  if (problem) {
    return NextResponse.json(
      { error: problem, hint: 'Set the variable in Vercel → Settings → Environment Variables, then redeploy.' },
      { status: 503 },
    );
  }
  return null;
}

/**
 * Object name: `<productId>/<timestamp>-<slug>.<ext>`.
 *
 * The product id keeps one listing's files together; the timestamp
 * stops an upload from silently overwriting a previous version (an old
 * order's grant points at the OLD path and must keep resolving); the
 * slug keeps it readable in the Storage dashboard. Everything outside
 * [a-z0-9-] is stripped, so a filename can't escape the bucket.
 */
function objectName(productId: string, filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const base =
    filename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file';
  const safeProduct =
    productId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) ||
    'product';
  return `${safeProduct}/${Date.now()}-${base}.${ext}`;
}

export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    productId?: unknown;
    filename?: unknown;
    sizeBytes?: unknown;
    path?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  /* ------------------------------------------------------------ sign */
  if (body.action === 'sign') {
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : 0;

    if (!filename || filename.length > 200) {
      return NextResponse.json({ error: 'The file needs a name (200 characters max).' }, { status: 400 });
    }
    if (!productId || productId.length > 80) {
      return NextResponse.json({ error: 'Missing product id.' }, { status: 400 });
    }

    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const mime = ALLOWED_MIME.get(
      // The browser reports the MIME; we fall back to the extension so a
      // client that sends an empty type still lands on the right entry.
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'pdf'
          ? 'application/pdf'
          : ext === 'zip'
            ? 'application/zip'
            : ext === 'epub'
              ? 'application/epub+zip'
              : ext === 'png'
                ? 'image/png'
                : ext === 'webp'
                  ? 'image/webp'
                  : ext === 'mp4'
                    ? 'video/mp4'
                    : ext === 'mp3'
                      ? 'audio/mpeg'
                      : '',
    );
    if (!mime) {
      return NextResponse.json(
        {
          error: `“${filename}” is not an allowed file type. Use pdf, zip, epub, png, jpg, webp, mp4 or mp3.`,
        },
        { status: 400 },
      );
    }
    // Checked before the upload so an obviously oversized file never
    // travels. The client value is advisory — 'confirm' re-reads the
    // real object length and is the enforce.
    if (sizeBytes > MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is over ${Math.round(MAX_BYTES / (1024 * 1024))} MB — nothing was uploaded.` },
        { status: 413 },
      );
    }

    const path = objectName(productId, filename);

    // Mint the upload URL. The token in the returned URL is the ONLY
    // credential the browser needs — the service key never leaves here.
    const response = await supabaseFetch(
      `/storage/v1/object/upload/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      console.error('[digital-files] sign failed:', response.status, text.slice(0, 200));
      return NextResponse.json({ error: 'Could not prepare the upload — try again.' }, { status: 502 });
    }

    let payload: { url?: string; token?: string };
    try {
      payload = JSON.parse(text) as { url?: string; token?: string };
    } catch {
      return NextResponse.json({ error: 'Unexpected response from storage.' }, { status: 502 });
    }
    if (!payload.url) {
      return NextResponse.json({ error: 'Storage did not return an upload URL.' }, { status: 502 });
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    return NextResponse.json({
      path,
      // The browser PUTs to this absolute URL; the token rides in it, so
      // no Authorization header is required (and none is sent).
      uploadUrl: payload.url.startsWith('http') ? payload.url : `${base}/storage/v1${payload.url}`,
      contentType: mime,
      filename,
    });
  }

  /* --------------------------------------------------------- confirm */
  if (body.action === 'confirm') {
    const path = typeof body.path === 'string' ? body.path.trim() : '';
    if (!path || path.startsWith('/') || path.includes('..') || path.length > 300) {
      return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
    }

    // HEAD the object with the service role: this is where the real
    // size and MIME are read back, because the browser could have sent
    // anything it liked in the sign request.
    const head = await supabaseFetch(
      `/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
      { method: 'HEAD' },
    );
    if (!head.ok) {
      return NextResponse.json(
        { error: 'That upload did not land in storage — try again.' },
        { status: 404 },
      );
    }

    const declared = Number(head.headers.get('content-length') ?? '0');
    const contentType = (head.headers.get('content-type') ?? '').split(';')[0]!.trim();

    if (declared > MAX_BYTES) {
      // Over the ceiling: delete rather than keep an object that would
      // never be deliverable, so the bucket cannot fill with dead weight.
      await supabaseFetch(
        `/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
        { method: 'DELETE' },
      ).catch(() => undefined);
      return NextResponse.json(
        { error: `That file is over ${Math.round(MAX_BYTES / (1024 * 1024))} MB — it was not kept.` },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIME.has(contentType)) {
      await supabaseFetch(
        `/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
        { method: 'DELETE' },
      ).catch(() => undefined);
      return NextResponse.json(
        { error: `Storage reports “${contentType || 'unknown type'}”, which is not an allowed file type.` },
        { status: 415 },
      );
    }

    return NextResponse.json({
      path,
      filename: path.split('/').pop() ?? path,
      sizeBytes: declared,
      contentType,
    });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

/** DELETE ?path= — remove one object. Only ever touches our bucket. */
export async function DELETE(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;

  const path = request.nextUrl.searchParams.get('path') ?? '';
  if (!path || path.startsWith('/') || path.includes('..') || path.length > 300) {
    return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
  }

  const response = await supabaseFetch(
    `/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
    { method: 'DELETE' },
  );
  // 404 = already gone, which for a clear action is success.
  if (!response.ok && response.status !== 404) {
    const detail = (await response.text()).slice(0, 200);
    console.error('[digital-files] delete failed:', response.status, detail);
    return NextResponse.json({ error: 'Could not remove the file.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
