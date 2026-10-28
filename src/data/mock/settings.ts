import type { SiteSettings } from '@/lib/types';

/**
 * Storefront-wide settings, seeded verbatim from src/data/site.ts in the
 * main repo. Per-page SEO mirrors each route's `metadata` export.
 * The WhatsApp number stays the placeholder the studio must replace —
 * never invent one.
 */
export const settings: SiteSettings = {
  siteName: 'Cra7ty Hub',
  tagline: 'Handfolded origami and paper goods, Lagos.',
  whatsappNumber: '234XXXXXXXXXX',
  whatsappDisplay: '+234 XXXX XXX XXXX',
  email: 'orders@cra7tyhub.ng',
  address: 'Victory Estate, Ago Palace Way, Okota, Lagos',
  instagram: 'cra7tyhub',
  freeDeliveryOver: 50000,
  seo: {
    home: {
      title: 'Cra7ty Hub — Handfolded origami and paper goods, Lagos.',
      description:
        'Handfolded origami cranes, pressed paper plates, party packs and gift wrap, folded in Lagos and delivered across Nigeria. Order on WhatsApp, no payment gateway.',
    },
    shop: {
      title: 'Shop — Cra7ty Hub',
      description:
        'All {total} products from the Cra7ty Hub studio: handfolded origami, pressed bagasse tableware, party packs, gift wrap and loose origami paper, shipped flat from Lagos.',
    },
    blog: {
      title: 'The folio — Cra7ty Hub',
      description:
        'Notes from the Cra7ty Hub studio in Lagos: how a two-hundred guest order is counted, why bagasse plates hold hot food, how a crane is folded, how bulk pricing works and why everything ships flat.',
    },
    about: {
      title: 'About — Cra7ty Hub',
      description:
        'The Cra7ty Hub studio: one room on Ago Palace Way in Okota, Lagos, folding paper since 2019. How the orders work, how bulk works, and how to reach the people who fold it.',
    },
    product: {
      // per-product routes compose their own title/description from product
      // data; site.description is the documented fallback (site.ts).
      title: '',
      description:
        'Handfolded origami cranes, pressed paper plates, party packs and gift wrap, folded in Lagos and delivered across Nigeria. Order on WhatsApp, no payment gateway.',
    },
    tracker: {
      placeholder: true,
      title: 'My Order — Cra7ty Hub',
      description:
        'Look up a Cra7ty Hub order by its reference and see where it is.',
    },
  },
};
