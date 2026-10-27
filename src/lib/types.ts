/* ------------------------------------------------------------------
   CRA7TY HUB ADMIN — shared types.
   These describe the mock data layer; the backend maps onto these
   shapes later. Storefront types (in the main repo) are independent —
   this file is add-only, nothing here is imported from the storefront.
   ------------------------------------------------------------------ */

export type VariantType = 'colour' | 'size' | 'material';

/** Which procedural 3D model represents a product or illustrates a post.
 *  Same seven keys the storefront's ModelKey allows. */
export type ModelKey = 'crane' | 'plate' | 'spoon' | 'box' | 'flower' | 'cup' | 'sheet';

/** One row of a product's detail-page spec table. */
export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductVariant {
  /** Stable id, unique within the product. */
  id: string;
  /** Which axis this variant belongs to. */
  type: VariantType;
  /** Display value: colour name, size name, material name. */
  value: string;
  /** For colour variants: the hex used by the swatch. */
  hex?: string;
  /** Per-variant stock; falls back to product stock when undefined. */
  stock?: number;
  /** Per-variant price override in whole naira. */
  priceOverride?: number;
  active: boolean;
}

export interface Product {
  id: string;
  /** URL segment for /products/[slug] — unique across the shop. */
  slug: string;
  name: string;
  description: string;
  category: string;
  /** Whole naira. */
  price: number;
  /** Struck-through original price; undefined = no comparison shown.
   *  Stored, but the storefront does not render it yet — its own Product
   *  type has no compare price (flagged, not silently wired). */
  compareAtPrice?: number;
  /** Short mono flag shown on the card, e.g. 'Handfolded'. */
  badge?: string;
  /** Procedural model shown on the card and detail route.
   *  DEPRECATED (Tier 2): the editor control was removed — every product
   *  surface renders photos and nothing reads this. Kept so the DB column
   *  (NOT NULL, seeded) and the static seed data still typecheck;
   *  catalog-store defaults it to 'crane' when absent. */
  model: ModelKey;
  /** Pack contents line on the detail route. */
  packCount?: string;
  /** Physical size line, shown where relevant. */
  size?: string;
  /** Longer editorial notes for /products/[slug], one paragraph each. */
  detail: string[];
  /** Detail-page spec table. */
  specs: ProductSpec[];
  stock: number;
  status: 'active' | 'inactive';
  /**
   * Tier 5: 'physical' (default, stock-tracked) or 'digital'
   * (delivered by a signed download link, never out of stock).
   * Mirrors products.product_type, which has the same default so every
   * pre-existing row stays 'physical'.
   */
  productType?: 'physical' | 'digital';
  /**
   * Digital only: the PRIVATE object path in the `digital-files` bucket.
   * A path, never a URL — links are signed on demand and expire, so a
   * stored URL would be a permanent credential. Undefined = no file
   * attached yet (a digital product cannot be published without one).
   */
  downloadPath?: string;
  /** Digital only: the buyer-facing filename used for the download. */
  downloadFilename?: string;
  variants: ProductVariant[];
  tags: string[];
  images: string[];
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
  };
  /** Shelf order — server-managed: preserved on edit, appended on create. */
  position: number;
  updatedAt: string; // ISO date
}

export type OrderStatus = 'pending' | 'confirmed' | 'in_transit' | 'delivered' | 'cancelled';

/** Display order of the status timeline (cancellation is terminal but off-axis). */
export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'in_transit',
  'delivered',
  'cancelled',
];

export interface OrderItem {
  productName: string;
  variant?: string;
  quantity: number;
  /** Unit price, whole naira. */
  unitPrice: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: OrderItem[];
  /** subtotal − discount + deliveryFee */
  deliveryFee: number;
  promoCode?: string;
  /** Discount amount applied, whole naira. */
  discount?: number;
  status: OrderStatus;
  paymentRef: string;
  /** Payment axis — written by the checkout confirmation path (webhook /
   *  verify), never by admin edits. 'pending' = order created, money not
   *  landed yet; 'refunded' is manual. */
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentDate: string; // ISO datetime ('' when not paid yet)
  notes?: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  /** Buyer email — Paystack's contact + the payment receipt. */
  customerEmail?: string;
  /** Paid but flagged by the confirmation path (amount mismatch, stock
   *  shortfall, coupon race, cancelled-but-paid). Needs a human. */
  needsReview?: boolean;
  reviewReason?: string | null;
}

export type PostStatus = 'draft' | 'published';

export interface BlogPost {
  id: string;
  title: string;
  /** Masked-headline lines on /blog/[slug] — derived from the title when
   *  left empty, then editable. */
  titleLines: string[];
  /** One-sentence summary under the title and in the page's metadata. */
  standfirst: string;
  slug: string;
  excerpt: string;
  /** Markdown body — preview renders the seven toolbar constructs only.
   *  Stored in the DB as `body`, an array of markdown blocks. */
  content: string;
  category: string;
  /** Mono category chip. */
  model: ModelKey;
  /** ISO date, YYYY-MM-DD — drives newest-first ordering on /blog. */
  date: string;
  /** Reading time in minutes; derived from the body when left empty. */
  minutes: number;
  /** Real product ids for the related strip; empty means none. */
  relatedProductIds: string[];
  tags: string[];
  status: PostStatus;
  placeholder: boolean;
  /** Optional cover image chosen from the media library. */
  coverUrl: string | null;
  /** ISO date; set when first published. */
  publishedAt: string | null;
  updatedAt: string; // ISO datetime
}

export type DiscountType = 'percentage' | 'flat';

export interface PromoCode {
  id: string;
  code: string;
  type: DiscountType;
  /** Percentage (0–100) or whole naira, depending on type. */
  value: number;
  usageCount: number;
  usageLimit?: number;
  /** ISO date */
  expiresAt: string;
  minOrderAmount?: number;
  active: boolean;
}

/* ------------------------------------------------------------------
   THE WORKBENCH — full site editing (stages 1–8).
   Content keys are stable dotted strings the backend will reuse,
   e.g. home.hero.headline.0 / home.faq.items.2.question.
   Drafts track list items by id; positional keys are generated
   only when a draft is published.
   ------------------------------------------------------------------ */

/** Every storefront page the admin can edit. `global` is the pseudo-page
 *  holding nav, footer, order drawer and consent card copy. */
export type PageKey =
  | 'global'
  | 'home'
  | 'shop'
  | 'blog'
  | 'about'
  | 'product'
  | 'tracker';

/** One reorderable/hideable block on a page. */
export interface PageSection {
  id: string;
  page: PageKey;
  /** matches the content-key prefix, e.g. 'hero' → home.hero.* */
  key: string;
  label: string;
  position: number;
  visible: boolean;
  /** selected layout variant, when the section has variants */
  variant?: string;
  /** fixed layout choices; absent = no variant picker */
  variants?: string[];
  /** section canonical on another page (bulk, why) — edited there only */
  sharedFrom?: PageKey;
}

/** Field types shared by scalar fields and list-item fields. */
export type ContentFieldType = 'text' | 'longtext' | 'link' | 'number' | 'flag' | 'image';

/** A single editable text/number/link value on a section. */
export interface ContentField {
  /** stable dotted key, e.g. home.hero.headline.0 */
  key: string;
  label: string;
  type: Exclude<ContentFieldType, 'flag'>;
  /** seeded value lifted from the real storefront */
  value: string | number;
  maxLength?: number;
  required: boolean;
  /** names of tokens allowed in this field, e.g. ['shown','total'] */
  tokens?: string[];
  /** seed is forward-looking/placeholder copy until real copy lands */
  placeholder?: boolean;
}

/** One row shape inside a ContentList. */
export interface ListItemFieldDef {
  key: string;
  label: string;
  type: ContentFieldType;
  maxLength?: number;
  required: boolean;
  /** token names allowed in this item field, e.g. ['shown','total'] */
  tokens?: string[];
}

export interface ContentListItem {
  /** stable id — drafts reference this, never the position */
  id: string;
  fields: Record<string, string | number | boolean>;
}

/** Repeating content: FAQ items, testimonials, marquee words, stations,
 *  nav/footer links, bulk events and tiers, hero stats, status labels. */
export interface ContentList {
  /** dotted prefix, e.g. home.faq.items */
  key: string;
  label: string;
  itemFields: ListItemFieldDef[];
  items: ContentListItem[];
  /** fixed membership: edit fields only, no add/remove/reorder
   *  (bulk tiers, status labels, sort options, computed label groups) */
  fixed?: boolean;
  placeholder?: boolean;
}

export interface PageSeo {
  title: string;
  description: string;
  /** seed is forward-looking copy until the page ships */
  placeholder?: boolean;
}

/** Storefront-wide settings — real values from the main repo's site.ts. */
export interface SiteSettings {
  siteName: string;
  tagline: string;
  /** international digits only, no +, spaces or dashes */
  whatsappNumber: string;
  whatsappDisplay: string;
  email: string;
  address: string;
  /** handle, not URL — the storefront builds the link */
  instagram: string;
  /** whole naira */
  freeDeliveryOver: number;
  seo: Partial<Record<PageKey, PageSeo>>;
}

export interface MediaItem {
  id: string;
  filename: string;
  url: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** bytes */
  sizeBytes: number;
  createdAt: string; // ISO datetime
}

export interface RevisionChange {
  /** content key or settings path */
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface Revision {
  id: string;
  at: string; // ISO datetime
  author: string;
  changes: RevisionChange[];
}

/** Storefront category. Ids are slugs — they ARE the /shop?category=…
 *  query values, so an id locks once published; name/blurb/order are
 *  freely editable and rows can be added or removed (Tier 2). */
export interface Category {
  id: string;
  /** two-digit editorial number, renumbered on reorder */
  index: string;
  name: string;
  blurb: string;
}

/** One unpublished edit, held in local state until Publish. */
export interface DraftState {
  id: string;
  type: 'field' | 'list' | 'section' | 'settings' | 'category';
  /** content key, list key, section id, settings path or category id */
  key: string;
  /** human label for the draft bar and the revision diff */
  label: string;
  page?: PageKey;
  before: unknown;
  after: unknown;
  at: string; // ISO datetime
}
