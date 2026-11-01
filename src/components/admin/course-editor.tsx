'use client';

import { useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, Images, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { MediaPicker } from '@/components/admin/workbench/media-picker';
import { useContent } from '@/components/admin/workbench/content-provider';
import { MediaImg } from '@/components/admin/media-img';
import { MEDIA_RULES } from '@/data/mock/media';
import type { MediaItem, Product } from '@/lib/types';
import { MAX_DOWNLOAD_FILES } from '@/lib/types';
import { saveProduct } from '@/lib/catalog-api';
import { uploadFileToStorage } from '@/lib/digital-file-upload';
import { cn } from '@/lib/utils';

/**
 * The course editor — a purpose-built form for /admin/courses, NOT a
 * relabeled ProductEditor. A course is deliberately narrower than a
 * product: name, slug, description, price, photos, the downloadable
 * files, and publish. None of the product furniture ships here — no
 * variants, no stock, no category picker, no physical/digital toggle,
 * no pack/size/specs/compare-at.
 *
 * What it shares with products is the PIPELINE, not the UI:
 *   - category is pinned to `courses` (the id /courses filters on) and
 *     productType is pinned to `digital`, both never editable here, so
 *     every save lands as a normal digital product row;
 *   - Save writes through the same /admin/api/products route (service
 *     role, server-side) and the same on-demand storefront revalidation;
 *   - photos go through the same Media page upload path;
 *   - files go through the same sign → PUT → confirm flow in
 *     lib/digital-file-upload, into the private `digital-files` bucket.
 *
 * Delivery, Paystack checkout, confirm_paid_order and the per-file
 * single-use download grants therefore need no changes: they read the
 * product row exactly as they already do.
 *
 * Deliberate difference from ProductEditor: publishing REQUIRES at least
 * one file. A product can be listed while its file is still coming; a
 * course with no file sells nothing, so Save draft is the only way past
 * that gate.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The category id the storefront's /courses page filters on. */
const COURSES_CATEGORY = 'courses';

/** Same slug rules as the product + blog editors: lowercase, dashes. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

interface CourseEditorProps {
  initial: Product;
  mode: 'new' | 'edit';
}

export function CourseEditor({ initial, mode }: CourseEditorProps) {
  const router = useRouter();
  // Photos share the Media page's backing path (Storage + media row), so
  // the shared library state updates with them.
  const { uploadMedia } = useContent();
  const [course, setCourse] = useState<Product>(initial);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  /** Whether the last note is an error (vermilion) or a success (moss). */
  const [noteIsError, setNoteIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Slug follows the name until it is edited by hand. */
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  /** Photo uploads run on their own, so the Photos card carries its note. */
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [photoNoteIsError, setPhotoNoteIsError] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  /** The files card runs its own upload, separately from Save. */
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [fileNoteIsError, setFileNoteIsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Which slot the next upload fills — null appends a new file, a number
   * replaces the file at that index (each upload gets its own object
   * path, so a replace never disturbs an old order's grant).
   */
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  const downloadFiles = course.downloadFiles ?? [];
  const filesAtCap = downloadFiles.length >= MAX_DOWNLOAD_FILES;

  const patch = (partial: Partial<Product>) =>
    setCourse((prev) => ({ ...prev, ...partial }));

  const removeImageSlot = (index: number) => {
    patch({ images: course.images.filter((_, i) => i !== index) });
  };

  const pickImage = (item: MediaItem) => {
    if (course.images.length >= 6) return;
    patch({ images: [...course.images, item.url] });
  };

  /**
   * Real upload: drag-and-drop or file picker → the same backing path as
   * the Media page (Storage bucket + media row, batch max 6, all-or-nothing).
   * Photos land in `images` in selection order — images[0] is always the
   * first picked, which is what the storefront shows as the cover.
   */
  const uploadPhotos = async (files: FileList | File[] | null) => {
    if (uploadingPhotos || !files) return;
    const batch = Array.from(files);
    if (batch.length === 0) return;

    const free = 6 - course.images.length;
    if (free <= 0) {
      setPhotoNoteIsError(true);
      setPhotoNote('A course holds at most 6 photos — remove one first.');
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
      patch({ images: [...course.images, ...items.map((item) => item.url)] });
      setPhotoNoteIsError(false);
      setPhotoNote(
        selected.length < batch.length
          ? `Uploaded ${items.length} photo${items.length === 1 ? '' : 's'} (${batch.length} selected — the 6-photo limit reached). Press Save to keep them with the course.`
          : `Uploaded ${items.length} photo${items.length === 1 ? '' : 's'}. Press Save to keep them with the course.`
      );
    } catch (error) {
      setPhotoNoteIsError(true);
      setPhotoNote((error as Error).message);
    } finally {
      setUploadingPhotos(false);
    }
  };

  /**
   * Attach the downloadable file — the same sign → PUT → confirm flow the
   * product editor uses (see lib/digital-file-upload), so the bytes go
   * straight to Storage and the server re-checks what landed.
   */
  const uploadCourseFile = async (file: File | undefined | null) => {
    if (!file || uploadingFile) return;

    const files = downloadFiles;
    const target = replaceIndex;
    if (target === null && files.length >= MAX_DOWNLOAD_FILES) {
      setFileNoteIsError(true);
      setFileNote(
        `${MAX_DOWNLOAD_FILES} files maximum — remove one before adding another.`,
      );
      return;
    }

    setFileNote(null);
    setFileNoteIsError(false);
    setUploadingFile(true);
    try {
      const entry = await uploadFileToStorage(course.id, file);

      const next = [...files];
      if (target !== null && target >= 0 && target < next.length) {
        next[target] = entry;
      } else {
        next.push(entry);
      }
      patch({ downloadFiles: next });
      setFileNoteIsError(false);
      setFileNote(
        target !== null && target < files.length
          ? `Replaced with “${file.name}”. Press Save to keep it with the course.`
          : `Attached “${file.name}”. Press Save to keep it with the course.`,
      );
    } catch (error) {
      setFileNoteIsError(true);
      setFileNote((error as Error).message);
    } finally {
      setUploadingFile(false);
      setReplaceIndex(null);
    }
  };

  const save = async (status: 'active' | 'inactive') => {
    setNoteIsError(false);
    setSaveNote(null);

    const name = course.name.trim();
    if (!name) {
      setNoteIsError(true);
      setSaveNote('The course needs a name before it can be saved.');
      return;
    }
    const slug = (slugTouched ? course.slug.trim() : slugify(name)) || slugify(name);
    if (!SLUG_RE.test(slug)) {
      setNoteIsError(true);
      setSaveNote(
        'The URL slug must be lowercase letters, numbers and dashes — e.g. folding-the-crane-basics.'
      );
      return;
    }
    if (!Number.isInteger(course.price) || course.price < 0) {
      setNoteIsError(true);
      setSaveNote('Price must be a whole number of naira.');
      return;
    }
    // A published course must show a real photo — same rule the server
    // enforces for products. Drafts stay exempt.
    const photoCount = course.images.filter(
      (src) => src.startsWith('http://') || src.startsWith('https://')
    ).length;
    if (status === 'active' && photoCount === 0) {
      setNoteIsError(true);
      setSaveNote(
        'Publishing needs at least one photo — upload one below or pick from the media library. Save draft works without one.'
      );
      return;
    }
    // Stricter than the product editor, on purpose: a course with no file
    // is undeliverable, so it can only be saved as a draft.
    if (status === 'active' && downloadFiles.length === 0) {
      setNoteIsError(true);
      setSaveNote(
        'A course needs at least one downloadable file before it can be published — attach one in Course files below, or save it as a draft.'
      );
      return;
    }

    const next: Product = {
      ...course,
      // Category + delivery are pinned here, never editable in this form:
      // they are what makes the row a course on the storefront while the
      // whole existing product pipeline delivers it.
      category: COURSES_CATEGORY,
      productType: 'digital',
      // A new course gets its permanent id on first save; edits keep theirs.
      id: mode === 'new' ? `product-${crypto.randomUUID()}` : course.id,
      name,
      slug,
      status,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const result = await saveProduct(next);
      setCourse(next);
      const refreshed = result.revalidate;
      if (refreshed && !refreshed.ok) {
        setNoteIsError(true);
        setSaveNote(
          `Saved, but refreshing the live site failed — ${refreshed.error ?? 'unknown error'}. The site will catch up within about 5 minutes.`
        );
      } else if (status === 'active') {
        setSaveNote(
          refreshed
            ? `Published — the courses page shows it now (site refreshed in ${refreshed.ms} ms).`
            : 'Published.'
        );
      } else {
        setSaveNote('Saved. It stays hidden from the courses page until you publish it.');
      }
      if (mode === 'new') router.push(`/admin/courses/${next.id}`);
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
        href="/admin/courses"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-paper-60 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden />
        All courses
      </Link>

      <PageHeader
        title={mode === 'new' ? 'New course' : course.name || 'Edit course'}
        subtitle={mode === 'edit' ? `ID ${course.id}` : undefined}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* ---------------- Left: form ---------------- */}
        <div className="space-y-4">
          <section className="card-admin space-y-4 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-paper">Course details</h2>
              <span className="font-mono text-[11px] text-paper-60">
                Sold on /courses
              </span>
            </div>

            <div>
              <label
                htmlFor="course-name"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Name
              </label>
              <input
                id="course-name"
                value={course.name}
                onChange={(e) => {
                  const name = e.target.value;
                  patch(slugTouched ? { name } : { name, slug: slugify(name) });
                }}
                placeholder="Folding the crane — basics"
                className="input-hairline"
              />
            </div>

            <div>
              <label
                htmlFor="course-desc"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
              >
                Description
              </label>
              <textarea
                id="course-desc"
                rows={5}
                value={course.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What the student learns, what is included, how it is delivered."
                className="input-hairline resize-y"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="course-price"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  Price (₦)
                </label>
                <input
                  id="course-price"
                  type="number"
                  min={0}
                  value={course.price}
                  onChange={(e) => patch({ price: Number(e.target.value) })}
                  className="input-hairline font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="course-slug"
                  className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
                >
                  URL slug
                </label>
                <input
                  id="course-slug"
                  value={course.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    patch({ slug: e.target.value.toLowerCase() });
                  }}
                  placeholder="folding-the-crane-basics"
                  className="input-hairline font-mono"
                />
                <p className="mt-1 font-mono text-[10px] text-paper-50">
                  /products/{course.slug || '…'} — must be unique
                </p>
              </div>
            </div>

            <p className="rounded-card border border-line bg-paper-12/50 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-paper-50">
              Filed under <span className="text-paper-70">courses</span> and delivered as a
              digital product — checkout, payment confirmation and the single-use download
              links all use the existing pipeline unchanged.
            </p>
          </section>
        </div>

        {/* ---------------- Right sidebar ---------------- */}
        <div className="space-y-4">
          {/* Publish card */}
          <section className="card-admin p-4">
            <h2 className="mb-3 text-sm font-medium text-paper">Publish</h2>
            <div
              role="group"
              aria-label="Course status"
              className="mb-4 inline-flex rounded-card border border-line p-0.5"
            >
              {(['active', 'inactive'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ status: s })}
                  aria-pressed={course.status === s}
                  className={cn(
                    'rounded-[3px] px-3 py-1.5 font-mono text-[11px] capitalize transition-colors',
                    course.status === s
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

          {/* Course files — the downloadable content the student receives */}
          <section className="card-admin p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-paper">Course files</h2>
              <span className="font-mono text-[11px] text-paper-40">
                {downloadFiles.length} of {MAX_DOWNLOAD_FILES}
              </span>
            </div>
            <p className="mb-3 font-mono text-[10px] leading-relaxed text-paper-40">
              Delivered by a single-use download link after payment · stored privately
            </p>

            {downloadFiles.length > 0 && (
              <ol className="space-y-2">
                {downloadFiles.map((file, index) => (
                  <li
                    key={file.path}
                    className="rounded-card border border-line bg-kraft-12/50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] tabular-nums text-paper-40">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <p className="truncate font-mono text-[11px] text-paper">
                          {file.filename}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-paper-40">
                          Attached · stored privately
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${file.filename} up`}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...downloadFiles];
                            [next[index], next[index - 1]] = [next[index - 1]!, next[index]!];
                            patch({ downloadFiles: next });
                          }}
                          className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ArrowUp size={13} aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${file.filename} down`}
                          disabled={index === downloadFiles.length - 1}
                          onClick={() => {
                            const next = [...downloadFiles];
                            [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                            patch({ downloadFiles: next });
                          }}
                          className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper disabled:pointer-events-none disabled:opacity-30"
                        >
                          <ArrowDown size={13} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFileNote(null);
                            setReplaceIndex(index);
                            fileInputRef.current?.click();
                          }}
                          className="rounded-card px-2 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-paper-60 hover:text-paper"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${file.filename}`}
                          onClick={() => {
                            patch({
                              downloadFiles: downloadFiles.filter((_, i) => i !== index),
                            });
                            setFileNoteIsError(false);
                            setFileNote('File removed — press Save to apply.');
                          }}
                          className="rounded-card p-2 text-paper-40 hover:text-vermilion"
                        >
                          <X size={13} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {filesAtCap ? (
              <p className="mt-3 font-mono text-[10px] text-paper-40">
                {MAX_DOWNLOAD_FILES} files maximum — remove one before adding another.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFileNote(null);
                  setReplaceIndex(null);
                  fileInputRef.current?.click();
                }}
                disabled={uploadingFile}
                className="mt-3 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors disabled:opacity-60"
              >
                <Upload size={16} aria-hidden className="text-kraft-60" />
                <span className="font-mono text-[11px] text-paper-70">
                  {uploadingFile ? 'Uploading to Storage…' : 'Drop or click — add a file'}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-paper-40">
                  pdf, zip, epub, png, jpg, webp, mp4, mp3 · max 50 MB each
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.zip,.epub,.png,.jpg,.jpeg,.webp,.mp4,.mp3,application/pdf,application/zip"
              aria-label="Upload course file"
              className="hidden"
              onChange={(e) => {
                void uploadCourseFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

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

            {course.status === 'active' && downloadFiles.length === 0 && (
              <p className="mt-3 font-mono text-[11px] text-vermilion">
                A published course needs at least one file — upload one above, or save it as
                a draft.
              </p>
            )}
          </section>

          {/* Photos card */}
          <section className="card-admin p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-paper">Photos</h2>
              <span className="font-mono text-[11px] text-paper-40">
                {course.images.length} of 6
              </span>
            </div>
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
              aria-label="Upload course photos"
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
            {course.images.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {course.images.map((src, i) => (
                  <div
                    key={`${src}-${i}`}
                    className="group relative aspect-square overflow-hidden rounded-card bg-kraft-12"
                    aria-label={`Photo ${i + 1}`}
                  >
                    {src.startsWith('http') ? (
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
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => removeImageSlot(i)}
                      className="absolute right-1 top-1 rounded-[3px] bg-bg/80 p-1 text-paper-70 opacity-0 transition-opacity group-hover:opacity-100 hover:text-vermilion"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
