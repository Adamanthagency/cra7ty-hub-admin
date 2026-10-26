import type { BlogPost, Product } from '@/lib/types';
import type { RevalidateStatus } from '@/lib/publish-api';

/**
 * The admin's wire to the catalog API routes (backend wiring: Products &
 * Blog) — the sibling of publish-api.ts for content.
 *
 * Client talks only to /admin/api/*, never to Supabase: the service-role
 * key lives in the route's server env. Hydration replaces the mock seeds as
 * the source of truth; the mocks remain only as instant paint while
 * loading and as the offline fallback, exactly like the workbench's
 * content provider.
 *
 * Every save is a single-row upsert that lands in the database immediately;
 * the route then asks the storefront to revalidate on demand, so the
 * change is live within seconds. The storefront's kept 300s timer is only
 * the safety net for a failed refresh call — which the responses report
 * as `revalidate` so the editors can say which one happened.
 */

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function explain(status: number): string {
  if (status === 401) return 'your session expired — sign in again';
  if (status === 409) return 'that slug is already taken';
  if (status === 503)
    return 'Supabase is not configured on this server (the response names the missing variable)';
  if (status === 502) return 'Supabase rejected the request';
  return `unexpected response (${status})`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as T;
}

/* ---------------------------- products ---------------------------- */

export async function fetchProducts(): Promise<Product[]> {
  const body = await getJson<{ products: Product[] }>('/admin/api/products');
  return body.products;
}

export async function saveProduct(
  product: Product,
): Promise<{ ok: true; id: string; slug: string; revalidate?: RevalidateStatus }> {
  return postJson('/admin/api/products', product);
}

export async function deleteProduct(
  id: string,
): Promise<{ revalidate?: RevalidateStatus }> {
  const response = await fetch(`/admin/api/products?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as { revalidate?: RevalidateStatus };
}

/* ------------------------------ posts ----------------------------- */

export async function fetchPosts(): Promise<BlogPost[]> {
  const body = await getJson<{ posts: BlogPost[] }>('/admin/api/posts');
  return body.posts;
}

export async function savePost(
  post: BlogPost,
): Promise<{ ok: true; id: string; slug: string; revalidate?: RevalidateStatus }> {
  return postJson('/admin/api/posts', post);
}

export async function deletePost(
  id: string,
): Promise<{ revalidate?: RevalidateStatus }> {
  const response = await fetch(`/admin/api/posts?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`${explain(response.status)} — ${await messageOf(response)}`);
  return (await response.json()) as { revalidate?: RevalidateStatus };
}
