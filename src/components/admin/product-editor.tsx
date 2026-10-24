'use client';

import { useMemo, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Images, Plus, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { VariantIndicator } from '@/components/admin/variant-indicator';
import { MediaPicker } from '@/components/admin/workbench/media-picker';
import { productCategories } from '@/data/mock/products';
import type { MediaItem, Product, ProductVariant, VariantType } from '@/lib/types';
import { formatNgn } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The product editor form — shared by /admin/products/new and
 * /admin/products/[id]. All state is local; nothing persists.
 *
 * Variant model rulings (recorded in the build log):
 * - "Selected" on an indicator = the variant currently being edited;
 *   it gets the vermilion ring + check and opens the edit drawer.
 * - The variant grid below shows every variant of the product (with a
 *   type tag); clicking a row selects it and opens the same drawer.
 */

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
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    setSaveNote('Variant added — local state only.');
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

  const addImageSlot = () => {
    if (product.images.length >= 6) return;
    patch({ images: [...product.images, `placeholder-${product.images.length + 1}`] });
  };

  const removeImageSlot = (index: number) => {
    patch({ images: product.images.filter((_, i) => i !== index) });
  };

  const pickImage = (item: MediaItem) => {
    if (product.images.length >= 6) return;
    patch({ images: [...product.images, item.url] });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addImageSlot();
  };

  const save = (status: 'active' | 'inactive') => {
    patch({ status, updatedAt: new Date().toISOString() });
    setSaveNote(
      status === 'active'
        ? 'Published — mock only, nothing sent to a backend.'
        : 'Draft saved — mock only, nothing sent to a backend.'
    );
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
                onChange={(e) => patch({ name: e.target.value })}
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
              <button type="button" onClick={() => save('inactive')} className="btn-ghost-dark flex-1">
                Save draft
              </button>
              <button type="button" onClick={() => save('active')} className="btn-vermilion flex-1">
                Publish
              </button>
            </div>
            {saveNote && (
              <p role="status" className="mt-3 font-mono text-[11px] text-moss-bright">
                {saveNote}
              </p>
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
              onDrop={onDrop}
              onClick={addImageSlot}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && addImageSlot()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors',
                dragOver ? 'border-vermilion bg-vermilion-20' : 'border-kraft-30 bg-kraft-12/50'
              )}
            >
              <Upload size={16} aria-hidden className="text-kraft-60" />
              <span className="font-mono text-[11px] text-paper-70">
                Drop or click — placeholder slots, no real upload
              </span>
            </div>
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
