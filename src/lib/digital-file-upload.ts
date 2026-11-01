import type { ProductDownloadFile } from '@/lib/types';

/**
 * The three-step digital-file upload, shared by the product editor and
 * the new course editor so the flow exists once rather than twice:
 *
 *   1. POST /admin/api/digital-files {action:'sign'} → a short-lived
 *      Storage upload URL + the real MIME the server derived from the
 *      extension (the browser's own file.type is not trusted).
 *   2. PUT the bytes DIRECTLY to Storage — never through this route.
 *      Vercel caps a function's request body at 4.5 MB, so a 40 MB PDF
 *      posted through a route handler answers 413 no matter what.
 *   3. POST {action:'confirm'} → the server re-reads the object that
 *      actually landed and enforces the 50 MiB platform ceiling + the
 *      bucket's allowed MIME list, deleting anything it will not accept.
 *
 * The service-role key never reaches the browser: the token embedded in
 * the signed URL is the only credential the PUT needs. The returned path
 * is bucket-relative and PRIVATE — links are minted per order on demand,
 * so a stored path is never itself a credential.
 *
 * Throws an Error with a user-readable message on any step failing; the
 * caller decides how to surface it.
 */
export async function uploadFileToStorage(
  productId: string,
  file: File,
): Promise<ProductDownloadFile> {
  const signRes = await fetch('/admin/api/digital-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'sign',
      productId,
      filename: file.name,
      sizeBytes: file.size,
    }),
  });
  const sign = (await signRes.json().catch(() => null)) as {
    path?: string;
    uploadUrl?: string;
    contentType?: string;
    error?: string;
  } | null;
  if (!signRes.ok || !sign?.uploadUrl || !sign.path) {
    throw new Error(sign?.error ?? 'Could not prepare the upload.');
  }

  // The file goes straight to Storage — no Vercel body limit.
  const put = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': sign.contentType ?? file.type },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Storage rejected the file (HTTP ${put.status}).`);
  }

  // The server checks what actually landed (size + mime) and deletes
  // anything it will not accept.
  const confirmRes = await fetch('/admin/api/digital-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', path: sign.path }),
  });
  const confirmed = (await confirmRes.json().catch(() => null)) as {
    path?: string;
    error?: string;
  } | null;
  if (!confirmRes.ok || !confirmed?.path) {
    throw new Error(confirmed?.error ?? 'The file could not be verified.');
  }

  return { path: confirmed.path, filename: file.name };
}
