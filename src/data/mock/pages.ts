import type { PageKey, PageSection } from '@/lib/types';

/**
 * The seven editable pages. `global` is the pseudo-page holding the nav,
 * footer, order drawer and consent card — copy that renders on every route.
 * Section order and visibility below match the storefront exactly as it
 * ships today (src/app + src/components/sections in the main repo).
 */
export interface PageMeta {
  key: PageKey;
  label: string;
  /** storefront route, for reference in the manager */
  route: string;
}

export const pages: PageMeta[] = [
  { key: 'home', label: 'Home', route: '/' },
  { key: 'shop', label: 'Shop', route: '/shop' },
  { key: 'blog', label: 'Blog', route: '/blog' },
  { key: 'about', label: 'About', route: '/about' },
  { key: 'product', label: 'Product page', route: '/products/[slug]' },
  { key: 'tracker', label: 'Tracker', route: '/tracker (coming)' },
  { key: 'global', label: 'Site-wide', route: 'Every page' },
];

export const pageSections: PageSection[] = [
  /* ---------------- HOME ---------------- */
  {
    id: 'home-hero',
    page: 'home',
    key: 'hero',
    label: 'Hero',
    position: 1,
    visible: true,
    variant: 'split',
    variants: ['split', 'stacked'],
  },
  { id: 'home-categories', page: 'home', key: 'categories', label: 'Categories index', position: 2, visible: true },
  {
    id: 'home-featured',
    page: 'home',
    key: 'featured',
    label: 'Featured products',
    position: 3,
    visible: true,
    variant: 'staggered',
    variants: ['staggered', 'grid'],
  },
  { id: 'home-marquee', page: 'home', key: 'marquee', label: 'Marquee strip', position: 4, visible: true },
  { id: 'home-process', page: 'home', key: 'process', label: 'Process steps', position: 5, visible: true },
  { id: 'home-bulk', page: 'home', key: 'bulk', label: 'Bulk band', position: 6, visible: true },
  { id: 'home-why', page: 'home', key: 'why', label: 'Why paper', position: 7, visible: true },
  {
    id: 'home-testimonials',
    page: 'home',
    key: 'testimonials',
    label: 'Testimonials',
    position: 8,
    visible: true,
    variant: 'offset',
    variants: ['offset', 'even'],
  },
  {
    id: 'home-faq',
    page: 'home',
    key: 'faq',
    label: 'FAQ',
    position: 9,
    visible: true,
    variant: 'split',
    variants: ['split', 'stacked'],
  },

  /* ---------------- SHOP ---------------- */
  { id: 'shop-header', page: 'shop', key: 'header', label: 'Page header', position: 1, visible: true },
  { id: 'shop-shelf', page: 'shop', key: 'shelf', label: 'Shelf and search', position: 2, visible: true },
  {
    id: 'shop-bulk',
    page: 'shop',
    key: 'bulk',
    label: 'Bulk band',
    position: 3,
    visible: true,
    sharedFrom: 'home',
  },

  /* ---------------- BLOG ---------------- */
  { id: 'blog-header', page: 'blog', key: 'header', label: 'Page header', position: 1, visible: true },
  { id: 'blog-lead', page: 'blog', key: 'lead', label: 'Lead note band', position: 2, visible: true },
  { id: 'blog-more', page: 'blog', key: 'more', label: 'More notes list', position: 3, visible: true },
  { id: 'blog-post', page: 'blog', key: 'post', label: 'Post template', position: 4, visible: true },
  { id: 'blog-closing', page: 'blog', key: 'closing', label: 'Closing and marquee', position: 5, visible: true },

  /* ---------------- ABOUT ---------------- */
  {
    id: 'about-hero',
    page: 'about',
    key: 'hero',
    label: 'Hero and marquee',
    position: 1,
    visible: true,
    variant: 'split',
    variants: ['split', 'stacked'],
  },
  { id: 'about-sheet', page: 'about', key: 'sheet', label: 'Studio sheet', position: 2, visible: true },
  { id: 'about-numbers', page: 'about', key: 'numbers', label: 'In numbers', position: 3, visible: true },
  {
    id: 'about-why',
    page: 'about',
    key: 'why',
    label: 'Why paper',
    position: 4,
    visible: true,
    sharedFrom: 'home',
  },
  { id: 'about-facts', page: 'about', key: 'facts', label: 'Facts and contact', position: 5, visible: true },
  { id: 'about-closing', page: 'about', key: 'closing', label: 'Closing band', position: 6, visible: true },

  /* ---------------- PRODUCT TEMPLATE ---------------- */
  {
    id: 'product-breadcrumb',
    page: 'product',
    key: 'breadcrumb',
    label: 'Breadcrumb',
    position: 1,
    visible: true,
  },
  { id: 'product-buy', page: 'product', key: 'buy', label: 'Buy column', position: 2, visible: true },
  { id: 'product-detail', page: 'product', key: 'detail', label: 'The detail', position: 3, visible: true },
  {
    id: 'product-specification',
    page: 'product',
    key: 'specification',
    label: 'Specification',
    position: 4,
    visible: true,
  },
  { id: 'product-related', page: 'product', key: 'related', label: 'More like this', position: 5, visible: true },

  /* ---------------- TRACKER (page shell, placeholder copy) ---------------- */
  { id: 'tracker-header', page: 'tracker', key: 'header', label: 'Page header', position: 1, visible: true },
  { id: 'tracker-search', page: 'tracker', key: 'search', label: 'Order search', position: 2, visible: true },
  { id: 'tracker-statuses', page: 'tracker', key: 'statuses', label: 'Status labels', position: 3, visible: true },

  /* ---------------- SITE-WIDE ---------------- */
  { id: 'global-navigation', page: 'global', key: 'navigation', label: 'Navigation', position: 1, visible: true },
  { id: 'global-footer', page: 'global', key: 'footer', label: 'Footer', position: 2, visible: true },
  {
    id: 'global-order-drawer',
    page: 'global',
    key: 'order-drawer',
    label: 'Order drawer and checkout',
    position: 3,
    visible: true,
    variant: 'whatsapp',
    // Not a layout variant: this flag picks the checkout capability
    // (WhatsApp-only vs Paystack+WhatsApp). It stores and round-trips, but
    // renders no difference until the Paystack stage — the next stage.
    variants: ['whatsapp', 'paystack+whatsapp'],
  },
  { id: 'global-consent', page: 'global', key: 'consent', label: 'Replay consent card', position: 4, visible: true },
];

/** Sections of one page, in position order. */
export const sectionsForPage = (page: PageKey): PageSection[] =>
  pageSections.filter((s) => s.page === page).sort((a, b) => a.position - b.position);
