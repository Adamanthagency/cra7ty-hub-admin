import type { BlogPost, ModelKey, Product, ProductSpec } from '@/lib/types';
import { configProblem, rest } from '@/lib/server/content-store';

/**
 * Server-only Supabase access for the catalog API routes (backend wiring:
 * Products & Blog). Same posture as content-store.ts: the SERVICE-ROLE key
 * lives here, is never sent to the browser, and every route using these
 * functions has already checked the admin session cookie and
 * `configProblem()`.
 *
 * Writes are plain PostgREST upserts (on_conflict=id), not a full-replace
 * RPC: a product and a post are independent entities, so a save touches one
 * row and can never clobber the shelf the way a delete-all payload could.
 *
 * position is resolved server-side on every save — the client never sets
 * shelf order. An existing row keeps its position; a new row appends to the
 * end.
 *
 * No RLS change is needed or made: products/blog_posts are public-read and
 * have no write policy, so anon and authenticated still cannot write —
 * these functions are the only writer, and they run inside admin routes.
 */

const MODELS: ModelKey[] = ['crane', 'plate', 'spoon', 'box', 'flower', 'cup', 'sheet'];
const CATEGORIES = ['origami', 'table', 'party', 'gift', 'bulk', 'paper'];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStr = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max;

const isStrArray = (v: unknown, items: number, len: number): v is string[] =>
  Array.isArray(v) && v.length <= items && v.every((x) => typeof x === 'string' && x.length <= len);

/* ------------------------------------------------------------------ */
/* Rows as PostgREST returns them                                      */
/* ------------------------------------------------------------------ */

interface ProductRow {
  id: string;
  position: number;
  slug: string;
  name: string;
  category: string;
  price: number;
  compare_at_price: number | null;
  description: string;
  badge: string | null;
  model: string;
  pack_count: string | null;
  size: string | null;
  detail: string[];
  specs: ProductSpec[];
  status: string;
  stock: number;
  variants: Product['variants'];
  tags: string[];
  images: string[];
  seo: Record<string, unknown> | null;
  updated_at: string;
}

interface PostRow {
  id: string;
  position: number;
  slug: string;
  title: string;
  title_lines: string[];
  standfirst: string;
  excerpt: string;
  date: string;
  minutes: number;
  category: string;
  model: string;
  body: string[];
  related_product_ids: string[];
  placeholder: boolean;
  status: string;
  tags: string[];
  cover_url: string | null;
  published_at: string | null;
  updated_at: string;
}

const PRODUCT_COLUMNS =
  'id,position,slug,name,category,price,compare_at_price,description,badge,model,pack_count,size,detail,specs,status,stock,variants,tags,images,seo,updated_at';
const POST_COLUMNS =
  'id,position,slug,title,title_lines,standfirst,excerpt,date,minutes,category,model,body,related_product_ids,placeholder,status,tags,cover_url,published_at,updated_at';

/* ------------------------------------------------------------------ */
/* Mapping: row → admin shape                                          */
/* ------------------------------------------------------------------ */

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
    ...(row.compare_at_price === null ? {} : { compareAtPrice: row.compare_at_price }),
    ...(row.badge ? { badge: row.badge } : {}),
    model: row.model as ModelKey,
    ...(row.pack_count ? { packCount: row.pack_count } : {}),
    ...(row.size ? { size: row.size } : {}),
    detail: row.detail ?? [],
    specs: row.specs ?? [],
    stock: row.stock ?? 0,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    variants: row.variants ?? [],
    tags: row.tags ?? [],
    images: row.images ?? [],
    ...(row.seo && Object.keys(row.seo).length > 0 ? { seo: row.seo as Product['seo'] } : {}),
    position: row.position,
    updatedAt: row.updated_at,
  };
}

function toPost(row: PostRow): BlogPost {
  return {
    id: row.id,
    title: row.title,
    titleLines: row.title_lines ?? [],
    standfirst: row.standfirst,
    slug: row.slug,
    excerpt: row.excerpt,
    content: (row.body ?? []).join('\n\n'),
    category: row.category,
    model: row.model as ModelKey,
    date: row.date,
    minutes: row.minutes,
    relatedProductIds: row.related_product_ids ?? [],
    tags: row.tags ?? [],
    status: row.status === 'draft' ? 'draft' : 'published',
    placeholder: row.placeholder,
    coverUrl: row.cover_url,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/* ------------------------------------------------------------------ */
/* Validation — shape first, so nothing unvalidated reaches PostgREST  */
/* ------------------------------------------------------------------ */

export function validateProduct(input: unknown): { error: string } | { product: Product } {
  if (!isRecord(input)) return { error: 'Expected a product object.' };
  const p = input as Record<string, unknown>;

  if (!isStr(p.id, 80) || !p.id) return { error: 'The product needs an id.' };
  if (!isStr(p.slug, 80) || !SLUG_PATTERN.test(p.slug)) {
    return { error: 'The slug must be lowercase letters, numbers and single dashes (like paper-plates-9-inch-25).' };
  }
  if (!isStr(p.name, 160) || !p.name.trim()) return { error: 'The product needs a name.' };
  if (!isStr(p.description, 600)) return { error: 'The description is too long (600 characters max).' };
  if (typeof p.category !== 'string' || !CATEGORIES.includes(p.category)) {
    return { error: `Category must be one of: ${CATEGORIES.join(', ')}.` };
  }
  if (typeof p.price !== 'number' || !Number.isInteger(p.price) || p.price < 0) {
    return { error: 'Price must be a whole number of naira.' };
  }
  if (
    p.compareAtPrice !== undefined &&
    p.compareAtPrice !== null &&
    (typeof p.compareAtPrice !== 'number' || !Number.isInteger(p.compareAtPrice) || p.compareAtPrice < 0)
  ) {
    return { error: 'Compare-at price must be a whole number of naira.' };
  }
  if (typeof p.model !== 'string' || !MODELS.includes(p.model as ModelKey)) {
    return { error: `Model must be one of: ${MODELS.join(', ')}.` };
  }
  if (p.status !== 'active' && p.status !== 'inactive') {
    return { error: 'Status must be active or inactive.' };
  }
  if (typeof p.stock !== 'number' || !Number.isInteger(p.stock) || p.stock < 0) {
    return { error: 'Stock must be zero or more.' };
  }
  if (!isStrArray(p.detail, 40, 2000)) return { error: 'Detail must be up to 40 paragraphs.' };
  if (!Array.isArray(p.specs) || p.specs.length > 30) return { error: 'Specs must be up to 30 rows.' };
  for (const spec of p.specs as unknown[]) {
    if (
      !isRecord(spec) ||
      !isStr((spec as Record<string, unknown>).label, 80) ||
      !isStr((spec as Record<string, unknown>).value, 160)
    ) {
      return { error: 'Every spec row needs a label and a value.' };
    }
  }
  if (!Array.isArray(p.variants) || p.variants.length > 100) return { error: 'Too many variants (100 max).' };
  if (!isStrArray(p.tags, 50, 60)) return { error: 'Tags must be up to 50 short strings.' };
  if (!isStrArray(p.images, 6, 500)) return { error: 'Images must be up to 6 URLs.' };
  // Photos are mandatory for a published product (mandatory-photos stage):
  // a real photo is an http(s) URL — placeholder slots and legacy `/`
  // paths don't count. Drafts (inactive) are exempt so work-in-progress
  // can be saved without a photo.
  if (
    p.status === 'active' &&
    !(p.images as string[]).some((src) => /^https?:\/\//.test(src))
  ) {
    return {
      error:
        'Publishing needs at least one photo — add one from the media library (Save draft works without one).',
    };
  }
  if (p.seo !== undefined && p.seo !== null && !isRecord(p.seo)) return { error: 'SEO must be an object.' };
  if (p.badge !== undefined && p.badge !== null && !isStr(p.badge, 40)) return { error: 'Badge is too long (40 max).' };
  if (p.packCount !== undefined && p.packCount !== null && !isStr(p.packCount, 80)) return { error: 'Pack count is too long (80 max).' };
  if (p.size !== undefined && p.size !== null && !isStr(p.size, 80)) return { error: 'Size is too long (80 max).' };
  if (!Array.isArray(p.variants)) return { error: 'Variants must be a list.' };
  for (const v of p.variants as unknown[]) {
    if (!isRecord(v)) return { error: 'Every variant must be an object.' };
    const variant = v as Record<string, unknown>;
    if (!isStr(variant.id, 80) || !isStr(variant.value, 60)) return { error: 'Every variant needs an id and a value.' };
    if (!['colour', 'size', 'material'].includes(String(variant.type))) return { error: 'Variant type must be colour, size or material.' };
    if (typeof variant.active !== 'boolean') return { error: 'Every variant needs an active flag.' };
  }

  const product: Product = {
    id: p.id as string,
    slug: p.slug as string,
    name: (p.name as string).trim(),
    description: p.description as string,
    category: p.category as string,
    price: p.price as number,
    model: p.model as ModelKey,
    detail: p.detail as string[],
    specs: p.specs as ProductSpec[],
    stock: p.stock as number,
    status: p.status as Product['status'],
    variants: p.variants as Product['variants'],
    tags: p.tags as string[],
    images: p.images as string[],
    position: typeof p.position === 'number' && Number.isInteger(p.position) ? p.position : 0,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
    ...(typeof p.compareAtPrice === 'number' ? { compareAtPrice: p.compareAtPrice } : {}),
    ...(typeof p.badge === 'string' && p.badge ? { badge: p.badge } : {}),
    ...(typeof p.packCount === 'string' && p.packCount ? { packCount: p.packCount } : {}),
    ...(typeof p.size === 'string' && p.size ? { size: p.size } : {}),
    ...(isRecord(p.seo) ? { seo: p.seo as Product['seo'] } : {}),
  };
  return { product };
}

export function validatePost(input: unknown): { error: string } | { post: BlogPost } {
  if (!isRecord(input)) return { error: 'Expected a post object.' };
  const p = input as Record<string, unknown>;

  if (!isStr(p.id, 80) || !p.id) return { error: 'The post needs an id.' };
  if (!isStr(p.slug, 120) || !SLUG_PATTERN.test(p.slug)) {
    return { error: 'The slug must be lowercase letters, numbers and single dashes.' };
  }
  if (!isStr(p.title, 200) || !p.title.trim()) return { error: 'The post needs a title.' };
  if (!isStr(p.standfirst, 400) || !p.standfirst.trim()) {
    return { error: 'The post needs a standfirst — it sits under the title and in the page metadata.' };
  }
  if (!isStr(p.excerpt, 400) || !p.excerpt.trim()) {
    return { error: 'The post needs an excerpt — it is what /blog lists.' };
  }
  if (!isStr(p.content, 100_000)) return { error: 'The body is too long (100,000 characters max).' };
  if (!isStr(p.category, 60) || !p.category.trim()) return { error: 'The post needs a category.' };
  if (typeof p.model !== 'string' || !MODELS.includes(p.model as ModelKey)) {
    return { error: `Model must be one of: ${MODELS.join(', ')}.` };
  }
  if (!isStr(p.date, 10) || !DATE_PATTERN.test(p.date)) return { error: 'Date must be YYYY-MM-DD.' };
  if (typeof p.minutes !== 'number' || !Number.isInteger(p.minutes) || p.minutes < 1 || p.minutes > 600) {
    return { error: 'Reading time must be 1–600 minutes.' };
  }
  if (!isStrArray(p.titleLines, 4, 120)) return { error: 'Headline lines must be up to 4 short lines.' };
  if (
    !Array.isArray(p.titleLines) ||
    (p.titleLines as unknown[]).filter((line) => String(line).trim()).length === 0
  ) {
    return { error: 'The post needs at least one headline line (split from the title if unsure).' };
  }
  if (!isStrArray(p.relatedProductIds, 20, 80)) return { error: 'Related products must be up to 20 ids.' };
  if (!isStrArray(p.tags, 50, 60)) return { error: 'Tags must be up to 50 short strings.' };
  if (p.status !== 'draft' && p.status !== 'published') return { error: 'Status must be draft or published.' };
  if (typeof p.placeholder !== 'boolean') return { error: 'Placeholder must be true or false.' };
  if (p.coverUrl !== undefined && p.coverUrl !== null && !isStr(p.coverUrl, 500)) {
    return { error: 'Cover URL is too long (500 max).' };
  }
  if (
    p.publishedAt !== undefined &&
    p.publishedAt !== null &&
    (typeof p.publishedAt !== 'string' || p.publishedAt.length > 40)
  ) {
    return { error: 'publishedAt must be an ISO datetime or null.' };
  }

  const post: BlogPost = {
    id: p.id as string,
    title: (p.title as string).trim(),
    titleLines: p.titleLines as string[],
    standfirst: p.standfirst as string,
    slug: p.slug as string,
    excerpt: p.excerpt as string,
    content: p.content as string,
    category: p.category as string,
    model: p.model as ModelKey,
    date: p.date as string,
    minutes: p.minutes as number,
    relatedProductIds: p.relatedProductIds as string[],
    tags: p.tags as string[],
    status: p.status as BlogPost['status'],
    placeholder: p.placeholder as boolean,
    coverUrl: (p.coverUrl as string | null) ?? null,
    publishedAt: (p.publishedAt as string | null) ?? null,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
  };
  return { post };
}

/** The admin's markdown body → the DB's array of markdown blocks. */
export function bodyFromMarkdown(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function loadProducts(): Promise<Product[]> {
  const rows = await rest<ProductRow[]>(`products?select=${PRODUCT_COLUMNS}&order=position.asc`);
  return rows.map(toProduct);
}

export async function loadPosts(): Promise<BlogPost[]> {
  const rows = await rest<PostRow[]>(`blog_posts?select=${POST_COLUMNS}&order=date.desc`);
  return rows.map(toPost);
}

/* ------------------------------------------------------------------ */
/* Writes — one row at a time, position resolved server-side           */
/* ------------------------------------------------------------------ */

async function resolvePosition(table: 'products' | 'blog_posts', id: string): Promise<number> {
  const existing = await rest<{ position: number }[]>(
    `${table}?select=position&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  if (existing.length > 0) return existing[0]!.position;
  const highest = await rest<{ position: number }[]>(
    `${table}?select=position&order=position.desc&limit=1`,
  );
  return (highest[0]?.position ?? 0) + 1;
}

function isUniqueViolation(error: Error): boolean {
  return /HTTP 409/.test(error.message) || /23505/.test(error.message);
}

/** Thrown when a save collides with another row's unique slug — the route
 *  turns this into HTTP 409 with the same human wording. */
export class SlugConflictError extends Error {}

export async function saveProduct(product: Product): Promise<void> {
  const position = await resolvePosition('products', product.id);
  const row = {
    id: product.id,
    position,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    compare_at_price: product.compareAtPrice ?? null,
    description: product.description,
    badge: product.badge ?? null,
    model: product.model,
    pack_count: product.packCount ?? null,
    size: product.size ?? null,
    // Empty paragraphs and half-filled spec rows are not real content —
    // they are dropped here rather than shipped to the storefront.
    detail: product.detail.map((d) => d.trim()).filter(Boolean),
    specs: product.specs
      .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
      .filter((s) => s.label !== '' || s.value !== ''),
    status: product.status,
    stock: product.stock,
    variants: product.variants,
    tags: product.tags,
    images: product.images,
    seo: product.seo ?? {},
    updated_at: new Date().toISOString(),
  };

  try {
    await rest('products?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (error) {
    if (isUniqueViolation(error as Error)) {
      throw new SlugConflictError(`Another product already uses the slug “${product.slug}”.`);
    }
    throw error;
  }
}

export async function savePost(post: BlogPost): Promise<void> {
  const position = await resolvePosition('blog_posts', post.id);
  const now = new Date().toISOString();
  const row = {
    id: post.id,
    position,
    slug: post.slug,
    title: post.title,
    title_lines: post.titleLines,
    standfirst: post.standfirst,
    excerpt: post.excerpt,
    date: post.date,
    minutes: post.minutes,
    category: post.category,
    model: post.model,
    body: bodyFromMarkdown(post.content),
    related_product_ids: post.relatedProductIds,
    placeholder: post.placeholder,
    status: post.status,
    tags: post.tags,
    cover_url: post.coverUrl,
    published_at: post.publishedAt,
    updated_at: now,
  };

  try {
    await rest('blog_posts?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (error) {
    if (isUniqueViolation(error as Error)) {
      throw new SlugConflictError(`Another post already uses the slug “${post.slug}”.`);
    }
    throw error;
  }
}

/** Returns false when no row matched — the route answers 404. */
export async function deleteRow(table: 'products' | 'blog_posts', id: string): Promise<boolean> {
  const deleted = await rest<unknown[]>(
    `${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    },
  );
  return Array.isArray(deleted) && deleted.length > 0;
}

/** Re-exported so routes can share one config answer with content routes. */
export { configProblem };
