/* ------------------------------------------------------------------
   CRA7TY HUB ADMIN — shared types.
   These describe the mock data layer; the backend maps onto these
   shapes later. Storefront types (in the main repo) are independent —
   this file is add-only, nothing here is imported from the storefront.
   ------------------------------------------------------------------ */

export type VariantType = 'colour' | 'size' | 'material';

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
  name: string;
  description: string;
  category: string;
  /** Whole naira. */
  price: number;
  /** Struck-through original price; undefined = no comparison shown. */
  compareAtPrice?: number;
  stock: number;
  status: 'active' | 'inactive';
  variants: ProductVariant[];
  tags: string[];
  images: string[];
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
  };
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
  paymentStatus: 'paid' | 'failed';
  paymentDate: string; // ISO datetime
  notes?: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export type PostStatus = 'draft' | 'published';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  /** Markdown body — preview renders the seven toolbar constructs only. */
  content: string;
  category: string;
  tags: string[];
  status: PostStatus;
  placeholder: boolean;
  /** Optional cover image chosen from the media library. */
  coverUrl: string | null;
  /** ISO date; null while draft. */
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
export type ContentFieldType = 'text' | 'longtext' | 'link' | 'number' | 'flag';

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

/** Storefront category. IDs are fixed — the admin edits text and order. */
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
