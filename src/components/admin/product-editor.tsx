'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Images, Plus, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { VariantIndicator } from '@/components/admin/variant-indicator';
import { MediaPicker } from '@/components/admin/workbench/media-picker';
import { useContent } from '@/components/admin/workbench/content-provider';
import { MediaImg } from '@/components/admin/media-img';
import { productCategories } from '@/data/mock/products';
import { MEDIA_RULES } from '@/data/mock/media';
import type { MediaItem, Product, ProductVariant, VariantType } from '@/lib/types';
import { saveProduct } from '@/lib/catalog-api';
import { formatNgn } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The product editor form — shared by /admin/products/new and
 * /admin/products/[id]. Local state while editing; **Save writes one row
 * to the products table** through /admin/api/products (service role,
 * server-side) and only reports success after the server confirms it.
 *
 * The shape is the storefront's: slug, model, detail[], specs[] drive
 * /products/[slug], so those fields exist here and are required before a
 * save is allowed. position is never editable — the server keeps it.
 *
 * Variant model rulings (recorded in the build log):
 * - "Selected" on an indicator = the variant currently being edited;
 *   it gets the vermilion ring + check and opens the edit drawer.
 * - The variant grid below shows every variant of the product (with a
 *   type tag); clicking a row selects it and opens the same drawer.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Same slug rules as the blog editor: lowercase, dashes, no doubles. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const TYPE_LABEL: Record<VariantType, string> = {
  colour: 'Colour',
  size: 'Size',
  material: 'Material',
};

const TYPE_ORDER: VariantType[] = ['colour', 'size', 'material'];

let uidCounter = 0;
function newId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now()}-${uidCounter}`;
}

interface ProductEditorProps {
  initial: Product;
  mode: 'new' | 'edit';
}

export function ProductEditor({ initial, mode }: ProductEditorProps) {
  const router = useRouter();
  // The upload zone writes through the SAME path as the Media page
  // (POST /admin/api/media → Storage + media table), and the shared
  // library state updates with it.
  const { uploadMedia } = useContent();
  const [product, setProduct] = useState<Product>(initial);
  const [activeType, setActiveType] = useState<VariantType>('colour');
  /** Variant being edited — drives indicators + drawer. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingValue, setAddingValue] = useState<string | null>(null); // null = inline form closed
  const [newColourName, setNewColourName] = useState('');
  const [newColourHex, setNewColourHex] = useState('#e5391f');
  const [newTextValue, setNewTextValue] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [seoOpen, SeoOpenSet] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  /** Whether the last note is an error (vermilion) or a success (moss). */
  const [noteIsError, setNoteIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Slug follows the name until it is edited by hand. */
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** photo uploads run on their own, so the Images card carries its own note */
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [photoNoteIsError, setPhotoNoteIsError] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  /** Tier 5: the digital file card runs its own upload, separately. */
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [fileNoteIsError, setFileNoteIsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patch = (partial: Partial<Product>) =>
    setProduct((prev) => ({ ...prev, ...partial }));

  const patchVariant = (id: string, partial: Partial<ProductVariant>) =>
    setProduct((prev) => ({
      ...prev,
      variants: prev.variants.map((v) => (v.id === id ? { ...v, ...partial } : v)),
    }));

  const typeVariants = useMemo(
    () => product.variants.filter((v) => v.type === activeType),
    [product.variants, activeType]
  );

  const editing = product.variants.find((v) => v.id === editingId) ?? null;

  const addVariantValue = () => {
    if (activeType === 'colour') {
      const name = newColourName.trim();
      if (!name) return;
      const v: ProductVariant = {
        id: newId('var'),
        type: 'colour',
        value: name,
        hex: newColourHex,
        active: true,
      };
      setProduct((prev) => ({ ...prev, variants: [...prev.variants, v] }));
      setEditingId(v.id);
      setNewColourName('');
      setNewColourHex('#e5391f');
    } else {
      const value = newTextValue.trim();
      if (!value) return;
      const v: ProductVariant = {
        id: newId('var'),
        type: activeType,
        value,
        active: true,
      };
      setProduct((prev) => ({ ...prev, variants: [...prev.variants, v] }));
      setEditingId(v.id);
      setNewTextValue('');
    }
    setAddingValue(null);
    setNoteIsError(false);
    setSaveNote('Variant added — press Save to keep it with the product.');
  };

  const removeVariant = (id: string) => {
    setProduct((prev) => ({ ...prev, variants: prev.variants.filter((v) => v.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  const commitTags = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    patch({ tags });
    setTagDraft('');
  };

  const removeImageSlot = (index: number) => {
    patch({ images: product.images.filter((_, i) => i !== index) });
  };

  const pickImage = (item: MediaItem) => {
    if (product.images.length >= 6) return;
    patch({ images: [...product.images, item.url] });
  };

  /**
   * Real upload: drag-and-drop or file picker → the same backing path as
   * the Media page (Storage bucket + media row, batch max 6, all-or-nothing).
   * The selected photos land in `images` in selection order — images[0]
   * is always the first photo picked, which is what the storefront shows
   * as the product's main image.
   */
  const uploadPhotos = async (files: FileList | File[] | null) => {
    if (uploadingPhotos || !files) return;
    const batch = Array.from(files);
    if (batch.length === 0) return;

    const free = 6 - product.images.length;
    if (free <= 0) {
      setPhotoNoteIsError(true);
      setPhotoNote('A product holds at most 6 photos — remove one first.');
      return;
    }
    const selected = batch.slice(0, free);

    for (const file of selected) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const okType =
        MEDIA_RULES.acceptedMime.includes(file.type) ||
        MEDIA_RULES.acceptedTypes.includes(ext as (typeof MEDIA_RULES.acceptedTypes)[number]);
      if (!okType) {
        setPhotoNoteIsError(true);
        setPhotoNote(`“${file.name}” is not a jpg, png or webp — nothing was uploaded.`);
        return;
      }
      if (file.size > MEDIA_RULES.maxBytes) {
        setPhotoNoteIsError(true);
        setPhotoNote(
          `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 5 MB per file. Nothing was uploaded.`
        );
        return;
      }
    }

    setPhotoNote(null);
    setUploadingPhotos(true);
    try {
      const items = await uploadMedia(selected);
      patch({ images: [...product.images, ...items.map((item) => item.url)] });
      setPhotoNoteIsError(false);
      setPhotoNote(
        selected.length < batch.length
          ? `Uploaded ${items.length} photo${items.length === 1 ? '' : 's'} (${batch.length} selected — the 6-photo limit reached). Press Save to keep them with the product.`
          : `Uploaded ${items.length} photo${items.length === 1 ? '' : 's'}. Press Save to keep them with the product.`
      );
    } catch (error) {
      setPhotoNoteIsError(true);
      setPhotoNote((error as Error).message);
    } finally {
      setUploadingPhotos(false);
    }
  };

  /**
   * Tier 5: upload the digital file. Two round trips on purpose —
   * the bytes go DIRECTLY to Storage (Vercel caps a request body at
   * 4.5 MB, so a 40 MB PDF through this route would 413), then the
   * server re-reads the stored object and enforces the real ceiling
   * before we keep the path. The service key never reaches the browser.
   */
  const uploadDigitalFile = async (file: File | undefined | null) => {
    if (!file || uploadingFile) return;

    setFileNote(null);
    setFileNoteIsError(false);
    setUploadingFile(true);
    try {
      const signRes = await fetch('/admin/api/digital-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          productId: product.id,
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

      patch({
        downloadPath: confirmed.path,
        downloadFilename: file.name,
      });
      setFileNoteIsError(false);
      setFileNote(
        `Attached “${file.name}”. Press Save to keep it with the product.`,
      );
    } catch (error) {
      setFileNoteIsError(true);
      setFileNote((error as Error).message);
    } finally {
      setUploadingFile(false);
    }
  };

  const save = async (status: 'active' | 'inactive') => {
    setNoteIsError(false);
    setSaveNote(null);

    const name = product.name.trim();
    if (!name) {
      setNoteIsError(true);
      setSaveNote('The product needs a name before it can be saved.');
      return;
    }
    const slug = (slugTouched ? product.slug.trim() : slugify(name)) || slugify(name);
    if (!SLUG_RE.test(slug)) {
      setNoteIsError(true);
      setSaveNote('The URL slug must be lowercase letters, numbers and dashes — e.g. paper-plates-9-inch-25.');
      return;
    }
    if (!Number.isInteger(product.price) || product.price < 0) {
      setNoteIsError(true);
      setSaveNote('Price must be a whole number of naira.');
      return;
    }
    // A published product must show a real photo: at least one http(s)
    // URL in images (placeholder slots don't count). Same rule the server
    // enforces in validateProduct — drafts stay exempt.
    const photoCount = product.images.filter(
      (src) => src.startsWith('http://') || src.startsWith('https://')
    ).length;
    if (status === 'active' && photoCount === 0) {
      setNoteIsError(true);
      setSaveNote(
        'Publishing needs at least one photo — upload one below or pick from the media library. Save draft works without one.'
      );
      return;
    }

    const next: Product = {
      ...product,
      // A new product gets its permanent id on first save; edits keep theirs.
      id: mode === 'new' ? `product-${crypto.randomUUID()}` : product.id,
      name,
      slug,
      status,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const result = await saveProduct(next);
      setProduct(next);
      const refreshed = result.revalidate;
      if (refreshed && !refreshed.ok) {
        setNoteIsError(true);
        setSaveNote(
          `Saved, but refreshing the live site failed — ${refreshed.error ?? 'unknown error'}. The shop will catch up within about 5 minutes.`
        );
      } else if (status === 'active') {
        setSaveNote(
          refreshed
            ? `Published — the shop shows it now (site refreshed in ${refreshed.ms} ms).`
            : 'Published.'
        );
      } else {
        setSaveNote('Saved. It stays hidden from the shop until you set it active.');
      }
      if (mode === 'new') router.push(`/admin/products/${next.id}`);
    } catch (error) {
      setNoteIsError(true);
      setSaveNote((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden />
        All products
      </Link>

      <PageHeader
        title={mode === 'new' ? 'New product' : product.name || 'Edit product'}
        subtitle={mode === 'edit' ? `ID ${product.id}` : undefined}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* ---------------- Left: form ---------------- */}
        <div className="space-y-4">
          <section className="card-admin space-y-4 p-4 md:p-5">
            <div>
              <label
                htmlFor="product-name"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Name
              </label>
              <input
                id="product-name"
                value={product.name}
                onChange={(e) => {
                  const name = e.target.value;
                  patch(slugTouched ? { name } : { name, slug: slugify(name) });
                }}
                placeholder="Origami crane string, 20 pieces"
                className="input-hairline"
              />
            </div>

            <div>
              <label
                htmlFor="product-desc"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Description
              </label>
              <textarea
                id="product-desc"
                rows={4}
                value={product.description}
                onChange={(e) => patch({ description: e.target.value })}
                className="input-hairline resize-y"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="product-price"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Price (₦)
                </label>
                <input
                  id="product-price"
                  type="number"
                  min={0}
                  value={product.price}
                  onChange={(e) => patch({ price: Number(e.target.value) })}
                  className="input-hairline font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="product-compare"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Compare at (₦)
                </label>
                <input
                  id="product-compare"
                  type="number"
                  min={0}
                  value={product.compareAtPrice ?? ''}
                  onChange={(e) =>
                    patch({
                      compareAtPrice: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Optional"
                  className="input-hairline font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="product-category"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Category
                </label>
                <select
                  id="product-category"
                  value={product.category}
                  onChange={(e) => patch({ category: e.target.value })}
                  className="input-hairline"
                >
                  {productCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="product-stock"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Stock
                </label>
                <input
                  id="product-stock"
                  type="number"
                  min={0}
                  value={product.stock}
                  onChange={(e) => patch({ stock: Number(e.target.value) })}
                  className="input-hairline font-mono"
                />
              </div>
            </div>
          </section>

          {/* ---------------- Shop details — the storefront's shape -------- */}
          <section className="card-admin space-y-4 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-paper">Shop details</h2>
              <span className="font-mono text-[11px] text-paper-60">
                What /products/[slug] renders
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="product-slug"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  URL slug
                </label>
                <input
                  id="product-slug"
                  value={product.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    patch({ slug: e.target.value.toLowerCase() });
                  }}
                  placeholder="origami-crane-string-20"
                  className="input-hairline font-mono"
                />
                <p className="mt-1 font-mono text-[10px] text-paper-50">
                  /products/{product.slug || '…'} — must be unique
                </p>
              </div>
              {/* The 3D-model select was removed: every product surface
                  renders photos (ProductMedia), and nothing reads
                  product.model anymore. The column stays in the DB with a
                  server-side 'crane' default — see catalog-store. */}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="product-badge"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Badge
                </label>
                <input
                  id="product-badge"
                  value={product.badge ?? ''}
                  onChange={(e) => patch({ badge: e.target.value || undefined })}
                  placeholder="Optional — e.g. Bagasse"
                  className="input-hairline"
                />
              </div>
              <div>
                <label
                  htmlFor="product-pack"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Pack contents
                </label>
                <input
                  id="product-pack"
                  value={product.packCount ?? ''}
                  onChange={(e) => patch({ packCount: e.target.value || undefined })}
                  placeholder="Optional — e.g. 25 plates"
                  className="input-hairline"
                />
              </div>
              <div>
                <label
                  htmlFor="product-size"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Size
                </label>
                <input
                  id="product-size"
                  value={product.size ?? ''}
                  onChange={(e) => patch({ size: e.target.value || undefined })}
                  placeholder="Optional — e.g. 9 inch / 23 cm"
                  className="input-hairline"
                />
              </div>
            </div>

            {/* Editorial paragraphs — one row each, shown on the detail route */}
            <div>
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                Detail paragraphs
              </span>
              {product.detail.map((line, i) => (
                <div key={`detail-${i}`} className="mb-2 flex items-start gap-2">
                  <textarea
                    aria-label={`Detail paragraph ${i + 1}`}
                    rows={2}
                    value={line}
                    onChange={(e) =>
                      patch({
                        detail: product.detail.map((d, j) => (j === i ? e.target.value : d)),
                      })
                    }
                    className="input-hairline resize-y"
                  />
                  <button
                    type="button"
                    aria-label={`Remove paragraph ${i + 1}`}
                    onClick={() => patch({ detail: product.detail.filter((_, j) => j !== i) })}
                    className="mt-1.5 rounded-card p-1.5 text-paper-50 hover:bg-vermilion-20 hover:text-vermilion"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => patch({ detail: [...product.detail, ''] })}
                className="btn-ghost-dark"
              >
                <Plus size={13} aria-hidden />
                Add paragraph
              </button>
            </div>

            {/* Spec table rows */}
            <div>
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                Spec table
              </span>
              {product.specs.map((spec, i) => (
                <div
                  key={`spec-${i}`}
                  className="mb-2 grid grid-cols-[1fr_1.4fr_auto] items-start gap-2"
                >
                  <input
                    aria-label={`Spec ${i + 1} label`}
                    value={spec.label}
                    placeholder="Label"
                    onChange={(e) =>
                      patch({
                        specs: product.specs.map((s, j) =>
                          j === i ? { ...s, label: e.target.value } : s
                        ),
                      })
                    }
                    className="input-hairline"
                  />
                  <input
                    aria-label={`Spec ${i + 1} value`}
                    value={spec.value}
                    placeholder="Value"
                    onChange={(e) =>
                      patch({
                        specs: product.specs.map((s, j) =>
                          j === i ? { ...s, value: e.target.value } : s
                        ),
                      })
                    }
                    className="input-hairline"
                  />
                  <button
                    type="button"
                    aria-label={`Remove spec row ${i + 1}`}
                    onClick={() => patch({ specs: product.specs.filter((_, j) => j !== i) })}
                    className="mt-1.5 rounded-card p-1.5 text-paper-50 hover:bg-vermilion-20 hover:text-vermilion"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => patch({ specs: [...product.specs, { label: '', value: '' }] })}
                className="btn-ghost-dark"
              >
                <Plus size={13} aria-hidden />
                Add spec row
              </button>
            </div>
          </section>

          {/* ---------------- Variants ---------------- */}
          <section className="card-admin p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-paper">Variants</h2>
              <span className="font-mono text-[11px] text-paper-60">
                {product.variants.length} total
              </span>
            </div>

            {/* 1. Variant type selector */}
            <div
              role="group"
              aria-label="Variant type"
              className="mb-4 inline-flex rounded-card border border-line p-0.5"
            >
              {TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setActiveType(t);
                    setEditingId(null);
                    setAddingValue(null);
                  }}
                  aria-pressed={activeType === t}
                  className={cn(
                    'rounded-[3px] px-3 py-1.5 font-mono text-[11px] transition-colors',
                    activeType === t ? 'bg-paper-12 text-paper' : 'text-paper-60 hover:text-paper'
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            {/* 2. Indicator row */}
            {typeVariants.length > 0 ? (
              <div className="flex flex-wrap gap-2 rounded-card border border-line/60 bg-bg/50 p-3">
                {typeVariants.map((v) => (
                  <VariantIndicator
                    key={v.id}
                    type={v.type}
                    value={v.value}
                    hex={v.hex}
                    selected={editingId === v.id}
                    badge={v.stock !== undefined ? String(v.stock) : undefined}
                    onToggle={() => setEditingId((cur) => (cur === v.id ? null : v.id))}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-card border border-dashed border-line p-4 text-center font-mono text-xs text-paper-60">
                No {TYPE_LABEL[activeType].toLowerCase()} variants yet.
              </p>
            )}

            {/* 3. Add variant — inline form, never a modal */}
            <div className="mt-3">
              {addingValue === null ? (
                <button
                  type="button"
                  onClick={() => setAddingValue(activeType)}
                  className="inline-flex h-9 items-center gap-2 rounded-card border border-line px-3 text-sm text-paper-70 hover:border-paper-40 hover:text-paper"
                >
                  <Plus size={14} aria-hidden />
                  Add variant
                </button>
              ) : (
                <div className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-bg/50 p-3">
                  {activeType === 'colour' ? (
                    <>
                      <div>
                        <label
                          htmlFor="new-colour-hex"
                          className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                        >
                          Swatch
                        </label>
                        <input
                          id="new-colour-hex"
                          type="color"
                          value={newColourHex}
                          onChange={(e) => setNewColourHex(e.target.value)}
                          className="h-9 w-14 cursor-pointer rounded-card border border-line bg-bg p-1"
                        />
                      </div>
                      <div className="min-w-[10rem] flex-1">
                        <label
                          htmlFor="new-colour-name"
                          className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                        >
                          Colour name
                        </label>
                        <input
                          id="new-colour-name"
                          value={newColourName}
                          onChange={(e) => setNewColourName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addVariantValue()}
                          placeholder="Indigo"
                          className="input-hairline"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="min-w-[10rem] flex-1">
                      <label
                        htmlFor="new-text-value"
                        className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                      >
                        {TYPE_LABEL[activeType]} value
                      </label>
                      <input
                        id="new-text-value"
                        value={newTextValue}
                        onChange={(e) => setNewTextValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addVariantValue()}
                        placeholder={activeType === 'size' ? 'A4' : 'Recycled'}
                        className="input-hairline font-mono"
                      />
                    </div>
                  )}
                  <button type="button" onClick={addVariantValue} className="btn-vermilion">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingValue(null)}
                    className="btn-ghost-dark"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* 5. Variant grid */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                    <th scope="col" className="px-2 py-2 font-normal">Variant</th>
                    <th scope="col" className="px-2 py-2 text-right font-normal">Stock</th>
                    <th scope="col" className="px-2 py-2 text-right font-normal">Price override</th>
                    <th scope="col" className="px-2 py-2 text-right font-normal">Active</th>
                    <th scope="col" className="w-8 px-2 py-2">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center font-mono text-xs text-paper-60">
                        No variants yet — add one above.
                      </td>
                    </tr>
                  )}
                  {product.variants.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setEditingId((cur) => (cur === v.id ? null : v.id))}
                      className={cn(
                        'cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper-12',
                        editingId === v.id && 'bg-paper-12'
                      )}
                    >
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          {v.type === 'colour' && (
                            <span
                              aria-hidden
                              className="h-3 w-3 shrink-0 rounded-full border border-paper-15"
                              style={{ backgroundColor: v.hex ?? '#d9c7a7' }}
                            />
                          )}
                          <span className={cn('text-sm', v.active ? 'text-paper' : 'text-paper-40 line-through')}>
                            {v.value}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-paper-40">
                            {v.type}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-paper-70">
                        {v.stock ?? '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-paper-70">
                        {v.priceOverride !== undefined ? formatNgn(v.priceOverride) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={v.active}
                          aria-label={`${v.value} active`}
                          onClick={() => patchVariant(v.id, { active: !v.active })}
                          className={cn(
                            'ml-auto inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors',
                            v.active ? 'border-vermilion bg-vermilion-20' : 'border-line bg-bg'
                          )}
                        >
                          <span
                            className={cn(
                              'h-3.5 w-3.5 rounded-full transition-transform',
                              v.active
                                ? 'translate-x-4 bg-vermilion'
                                : 'translate-x-0 bg-paper-40'
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          aria-label={`Remove ${v.value}`}
                          onClick={() => removeVariant(v.id)}
                          className="rounded-card p-1 text-paper-40 hover:text-vermilion"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Edit drawer */}
            {editing && (
              <div className="mt-4 rounded-card border border-vermilion/40 bg-bg/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-paper">
                    <span
                      aria-hidden
                      className="h-3 w-3 rounded-full border border-paper-15"
                      style={{ backgroundColor: editing.hex ?? '#d9c7a7' }}
                    />
                    Edit {editing.value}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Close variant editor"
                    className="rounded-card p-1 text-paper-60 hover:text-paper"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`stock-${editing.id}`}
                      className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                    >
                      Variant stock
                    </label>
                    <input
                      id={`stock-${editing.id}`}
                      type="number"
                      min={0}
                      value={editing.stock ?? ''}
                      onChange={(e) =>
                        patchVariant(editing.id, {
                          stock: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Falls back to product stock"
                      className="input-hairline font-mono"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`price-${editing.id}`}
                      className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                    >
                      Price override (₦)
                    </label>
                    <input
                      id={`price-${editing.id}`}
                      type="number"
                      min={0}
                      value={editing.priceOverride ?? ''}
                      onChange={(e) =>
                        patchVariant(editing.id, {
                          priceOverride:
                            e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="None — use product price"
                      className="input-hairline font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Right sidebar ---------------- */}
        <div className="space-y-4">
          {/* Publish card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Publish</h2>
            <div
              role="group"
              aria-label="Product status"
              className="mb-4 inline-flex rounded-card border border-line p-0.5"
            >
              {(['active', 'inactive'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ status: s })}
                  aria-pressed={product.status === s}
                  className={cn(
                    'rounded-[3px] px-3 py-1.5 font-mono text-[11px] capitalize transition-colors',
                    product.status === s
                      ? 'bg-paper-12 text-paper'
                      : 'text-paper-60 hover:text-paper'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save('inactive')}
                disabled={saving}
                className="btn-ghost-dark flex-1 disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() => void save('active')}
                disabled={saving}
                className="btn-vermilion flex-1 disabled:opacity-50"
              >
                Publish
              </button>
            </div>
            {saveNote && (
              <p
                role={noteIsError ? 'alert' : 'status'}
                className={cn(
                  'mt-3 font-mono text-[11px]',
                  noteIsError ? 'text-vermilion' : 'text-moss-bright'
                )}
              >
                {saveNote}
              </p>
            )}
          </section>

          {/* Delivery card — Tier 5: physical vs digital, and the file a
              digital listing sells. Shown before Images because for a
              digital product the file IS the product. */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Delivery</h2>

            <div className="grid grid-cols-2 gap-2">
              {(['physical', 'digital'] as const).map((kind) => {
                const selected = (product.productType ?? 'physical') === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setFileNote(null);
                      // One patch, not two: switching back to physical
                      // must clear the file rather than carry it into a
                      // row that will never deliver one (and a second
                      // patch would just overwrite the first).
                      patch(
                        kind === 'physical'
                          ? { productType: 'physical', downloadPath: undefined, downloadFilename: undefined }
                          : { productType: 'digital' },
                      );
                    }}
                    className={cn(
                      'flex min-h-[44px] items-center justify-center rounded-card border px-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                      selected
                        ? 'border-vermilion bg-vermilion-20 text-paper'
                        : 'border-line text-paper-60 hover:border-paper-40 hover:text-paper',
                    )}
                    aria-pressed={selected}
                  >
                    {kind === 'physical' ? 'Physical' : 'Digital'}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-paper-40">
              {(product.productType ?? 'physical') === 'digital'
                ? 'Delivered instantly by download link — stock does not apply.'
                : 'Stock-tracked and dispatched by WhatsApp confirmation.'}
            </p>

            {(product.productType ?? 'physical') === 'digital' && (
              <div className="mt-4 border-t border-line pt-4">
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-paper-40">
                  File
                </h3>

                {product.downloadPath ? (
                  <div className="rounded-card border border-line bg-kraft-12/50 px-3 py-3">
                    <p className="truncate font-mono text-[11px] text-paper">
                      {product.downloadFilename ?? product.downloadPath.split('/').pop()}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-paper-40">
                      Attached · stored privately
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        patch({ downloadPath: undefined, downloadFilename: undefined });
                        setFileNoteIsError(false);
                        setFileNote('File removed — press Save to apply.');
                      }}
                      className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-vermilion underline-offset-2 hover:underline"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors disabled:opacity-60"
                  >
                    <Upload size={16} aria-hidden className="text-kraft-60" />
                    <span className="font-mono text-[11px] text-paper-70">
                      {uploadingFile ? 'Uploading to Storage…' : 'Drop or click — upload the file'}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-paper-40">
                      pdf, zip, epub, png, jpg, webp, mp4, mp3 · max 100 MB
                    </span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.zip,.epub,.png,.jpg,.jpeg,.webp,.mp4,.mp3,application/pdf,application/zip"
                  aria-label="Upload digital product file"
                  className="hidden"
                  onChange={(e) => {
                    void uploadDigitalFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                {product.downloadPath && !uploadingFile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-card border border-line px-3 text-xs text-paper-70 hover:border-paper-40 hover:text-paper"
                  >
                    <Upload size={14} aria-hidden />
                    Replace file
                  </button>
                )}

                {fileNote && (
                  <p
                    role={fileNoteIsError ? 'alert' : 'status'}
                    className={cn(
                      'mt-3 font-mono text-[11px]',
                      fileNoteIsError ? 'text-vermilion' : 'text-moss-bright'
                    )}
                  >
                    {fileNote}
                  </p>
                )}

                {(product.productType ?? 'physical') === 'digital' &&
                  product.status === 'active' &&
                  !product.downloadPath && (
                    <p className="mt-3 font-mono text-[11px] text-vermilion">
                      A published digital product needs its file — upload one
                      above, or save it as a draft.
                    </p>
                  )}
              </div>
            )}
          </section>

          {/* Images card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Images</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(false);
                void uploadPhotos(e.dataTransfer.files);
              }}
              onClick={() => photoInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && photoInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors',
                dragOver ? 'border-vermilion bg-vermilion-20' : 'border-kraft-30 bg-kraft-12/50'
              )}
            >
              <Upload size={16} aria-hidden className="text-kraft-60" />
              <span className="font-mono text-[11px] text-paper-70">
                {uploadingPhotos
                  ? 'Uploading to Storage…'
                  : 'Drop or click — real upload to the media library'}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-paper-40">
                jpg, png, webp · up to {MEDIA_RULES.maxPerBatch} at a time · max 5 MB each
              </span>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload product photos"
              className="hidden"
              onChange={(e) => {
                void uploadPhotos(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-card border border-line px-3 text-xs text-paper-70 hover:border-paper-40 hover:text-paper"
            >
              <Images size={14} aria-hidden />
              Choose from media
            </button>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {product.images.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="group relative aspect-square overflow-hidden rounded-card bg-kraft-12"
                  aria-label={`Image ${i + 1}`}
                >
                  {src.startsWith('/') ? (
                    <span className="flex h-full w-full items-center justify-center font-display text-xl text-kraft-60">
                      {src.split('/').pop()?.charAt(0).toUpperCase() ?? 'I'}
                    </span>
                  ) : src.startsWith('http') ? (
                    <MediaImg
                      src={src}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-mono text-[9px] text-kraft-60">
                      {src}
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 font-mono text-[10px] text-kraft-60">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove image ${i + 1}`}
                    onClick={() => removeImageSlot(i)}
                    className="absolute right-1 top-1 rounded-[3px] bg-bg/80 p-1 text-paper-70 opacity-0 transition-opacity group-hover:opacity-100 hover:text-vermilion"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 6 - product.images.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  aria-hidden
                  className="flex aspect-square items-center justify-center rounded-card border border-dashed border-line font-mono text-[10px] text-paper-40"
                >
                  {product.images.length + i + 1}
                </div>
              ))}
            </div>
            {photoNote && (
              <p
                role={photoNoteIsError ? 'alert' : 'status'}
                className={cn(
                  'mt-3 font-mono text-[11px]',
                  photoNoteIsError ? 'text-vermilion' : 'text-moss-bright'
                )}
              >
                {photoNote}
              </p>
            )}
          </section>

          {/* Tags card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Tags</h2>
            {product.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-card border border-line px-2 py-1 font-mono text-[11px] text-paper-70"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() =>
                        patch({ tags: product.tags.filter((t) => t !== tag) })
                      }
                      className="text-paper-40 hover:text-vermilion"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  commitTags(tagDraft);
                }
              }}
              onBlur={() => tagDraft && commitTags(tagDraft)}
              placeholder="Comma-separated, Enter to add"
              aria-label="Tags"
              className="input-hairline"
            />
          </section>

          {/* SEO card — collapsed by default */}
          <section className="card-admin">
            <button
              type="button"
              onClick={() => SeoOpenSet((v) => !v)}
              aria-expanded={seoOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-paper"
            >
              SEO
              <span className="font-mono text-[11px] text-paper-60">
                {seoOpen ? '−' : '+'}
              </span>
            </button>
            {seoOpen && (
              <div className="space-y-4 border-t border-line p-4">
                <div>
                  <label
                    htmlFor="seo-title"
                    className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                  >
                    Meta title
                  </label>
                  <input
                    id="seo-title"
                    value={product.seo?.metaTitle ?? ''}
                    onChange={(e) =>
                      patch({
                        seo: { ...product.seo, metaTitle: e.target.value },
                      })
                    }
                    className="input-hairline"
                  />
                </div>
                <div>
                  <label
                    htmlFor="seo-desc"
                    className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                  >
                    Meta description
                  </label>
                  <textarea
                    id="seo-desc"
                    rows={3}
                    value={product.seo?.metaDescription ?? ''}
                    onChange={(e) =>
                      patch({
                        seo: { ...product.seo, metaDescription: e.target.value },
                      })
                    }
                    className="input-hairline resize-y"
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={pickImage}
      />
    </div>
  );
}
