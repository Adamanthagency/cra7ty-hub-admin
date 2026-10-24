import type { ContentField, ContentList } from '@/lib/types';

/**
 * Every editable storefront string, seeded from the real source files in
 * the main repo (src/data/site.ts, products.ts, posts.ts and the section
 * components — copy hardcoded in JSX is noted per section).
 *
 * Content keys are stable dotted strings; the backend will use the same
 * keys. List items carry stable ids in the mock; positional keys
 * (…items.2.question) are generated from position at publish time.
 *
 * Count-bearing sentences carry the {shown}/{total} tokens per the
 * approved ruling; no other curly-brace tokens are allowed anywhere.
 */

/* ==================================================================
   GLOBAL — nav, footer, order drawer, consent (renders everywhere)
   ================================================================== */

const globalFields: ContentField[] = [
  // ---- navigation (site.ts navLinks + SiteNav.tsx "Order" button) ----
  { key: 'global.navigation.order-label', label: 'Order button label', type: 'text', value: 'Order', maxLength: 16, required: true },

  // ---- footer (site.ts footer + SiteFooter.tsx) ----
  {
    key: 'global.footer.small-print',
    label: 'Small print',
    type: 'longtext',
    value:
      'Cra7ty Hub is a Lagos paper studio. Prices in naira, inclusive of folding. Nothing is charged from this website — orders are confirmed on WhatsApp.',
    maxLength: 320,
    required: true,
  },
  { key: 'global.footer.reach-label', label: '"Reach us" heading', type: 'text', value: 'Reach us', maxLength: 24, required: true },
  { key: 'global.footer.studio-label', label: '"Studio" address label', type: 'text', value: 'Studio', maxLength: 24, required: true },
  { key: 'global.footer.whatsapp-label', label: 'WhatsApp link label', type: 'text', value: 'WhatsApp', maxLength: 24, required: true },
  { key: 'global.footer.instagram-label', label: 'Instagram link label', type: 'text', value: 'Instagram', maxLength: 24, required: true },

  // ---- order drawer (OrderDrawer.tsx — all copy hardcoded there) ----
  { key: 'global.order-drawer.eyebrow', label: 'Drawer eyebrow', type: 'text', value: 'Your order', maxLength: 24, required: true },
  { key: 'global.order-drawer.count-suffix', label: 'Item count suffix', type: 'text', value: 'items', maxLength: 12, required: true },
  { key: 'global.order-drawer.empty-header', label: 'Empty drawer header', type: 'text', value: 'Empty', maxLength: 16, required: true },
  { key: 'global.order-drawer.empty-headline', label: 'Empty drawer headline', type: 'text', value: 'Nothing in the order yet.', maxLength: 60, required: true },
  {
    key: 'global.order-drawer.empty-body',
    label: 'Empty drawer body',
    type: 'longtext',
    value:
      'Add a few things and we will build the message for you — every line, every quantity, the total, ready to send to +234 XXXX XXX XXXX.',
    maxLength: 280,
    required: true,
  },
  { key: 'global.order-drawer.browse-label', label: '"Browse the shop" button', type: 'text', value: 'Browse the shop', maxLength: 32, required: true },
  { key: 'global.order-drawer.ask-label', label: '"Ask a question" button', type: 'text', value: 'Ask a question', maxLength: 32, required: true },
  { key: 'global.order-drawer.send-label', label: 'Send on WhatsApp button', type: 'text', value: 'Send order on WhatsApp', maxLength: 40, required: true },
  {
    key: 'global.order-drawer.send-caption',
    label: 'Send button caption',
    type: 'longtext',
    value: 'Opens a message with every line, the quantities and the total. Nothing is charged here.',
    maxLength: 200,
    required: true,
  },
  { key: 'global.order-drawer.total-label', label: '"Order total" label', type: 'text', value: 'Order total', maxLength: 24, required: true },
  { key: 'global.order-drawer.clear-label', label: '"Clear order" button', type: 'text', value: 'Clear order', maxLength: 24, required: true },
  { key: 'global.order-drawer.remove-label', label: '"Remove" button', type: 'text', value: 'Remove', maxLength: 16, required: true },
  { key: 'global.order-drawer.each-suffix', label: 'Per-item price suffix', type: 'text', value: 'each', maxLength: 8, required: true },

  // ---- checkout copy (Paystack + WhatsApp) — placeholder until wired ----
  { key: 'global.order-drawer.promo-label', label: 'Promo code label', type: 'text', value: 'Promo code', maxLength: 24, required: true, placeholder: true },
  { key: 'global.order-drawer.promo-placeholder', label: 'Promo input placeholder', type: 'text', value: 'Enter code', maxLength: 32, required: true, placeholder: true },
  { key: 'global.order-drawer.promo-apply', label: 'Apply promo button', type: 'text', value: 'Apply', maxLength: 16, required: true, placeholder: true },
  { key: 'global.order-drawer.promo-invalid', label: 'Invalid promo message', type: 'text', value: 'That code is not valid.', maxLength: 80, required: true, placeholder: true },
  { key: 'global.order-drawer.promo-expired', label: 'Expired promo message', type: 'text', value: 'That code has expired.', maxLength: 80, required: true, placeholder: true },
  { key: 'global.order-drawer.discount-label', label: 'Discount line label', type: 'text', value: 'Discount', maxLength: 24, required: true, placeholder: true },
  { key: 'global.order-drawer.pay-now-label', label: '"Pay now" button', type: 'text', value: 'Pay now', maxLength: 24, required: true, placeholder: true },
  { key: 'global.order-drawer.paystack-caption', label: 'Paystack caption', type: 'text', value: 'Pay with Paystack', maxLength: 40, required: true, placeholder: true },
  { key: 'global.order-drawer.payment-failed', label: 'Payment failed message', type: 'longtext', value: 'Payment failed — nothing was charged. Try again, or send the order on WhatsApp instead.', maxLength: 200, required: true, placeholder: true },
  { key: 'global.order-drawer.payment-success', label: 'Payment success message', type: 'longtext', value: 'Payment received. The order is with the studio — you will get a WhatsApp confirmation.', maxLength: 200, required: true, placeholder: true },
  { key: 'global.order-drawer.whatsapp-caption', label: 'WhatsApp confirmation caption', type: 'longtext', value: 'Your order is confirmed on WhatsApp, not on this site.', maxLength: 160, required: true, placeholder: true },

  // ---- consent card (ReplayConsent.tsx) ----
  { key: 'global.consent.eyebrow', label: 'Consent eyebrow', type: 'text', value: 'Session replay', maxLength: 24, required: true },
  {
    key: 'global.consent.body',
    label: 'Consent body',
    type: 'longtext',
    value:
      'Allow a recording of this visit so we can see where the shop is confusing? Text and form fields are masked, and nothing is recorded until you choose.',
    maxLength: 280,
    required: true,
  },
  { key: 'global.consent.allow-label', label: '"Allow" button', type: 'text', value: 'Allow', maxLength: 16, required: true },
  { key: 'global.consent.decline-label', label: '"No thanks" button', type: 'text', value: 'No thanks', maxLength: 16, required: true },
  { key: 'global.consent.on-label', label: 'Granted-state label', type: 'text', value: 'Session replay on', maxLength: 24, required: true },
  { key: 'global.consent.turn-off-label', label: '"Turn off" button', type: 'text', value: 'Turn off', maxLength: 16, required: true },
];

const globalLists: ContentList[] = [
  // nav links (site.ts navLinks)
  {
    key: 'global.navigation.links',
    label: 'Nav links',
    itemFields: [
      { key: 'label', label: 'Label', type: 'text', maxLength: 24, required: true },
      { key: 'href', label: 'Link', type: 'link', maxLength: 120, required: true },
    ],
    items: [
      { id: 'nav-shop', fields: { label: 'Shop', href: '/shop' } },
      { id: 'nav-origami', fields: { label: 'Origami', href: '/shop?category=origami' } },
      { id: 'nav-party', fields: { label: 'Party Packs', href: '/shop?category=party' } },
      { id: 'nav-bulk', fields: { label: 'Bulk Orders', href: '/#bulk' } },
      { id: 'nav-blog', fields: { label: 'Blog', href: '/blog' } },
      { id: 'nav-about', fields: { label: 'About', href: '/about' } },
    ],
  },
  // footer columns (site.ts footer.columns) — headings only; the links
  // under each column are the three lists below
  {
    key: 'global.footer.columns',
    label: 'Footer columns',
    fixed: true,
    itemFields: [
      { key: 'heading', label: 'Heading', type: 'text', maxLength: 24, required: true },
    ],
    items: [
      { id: 'footer-col-shop', fields: { heading: 'Shop' } },
      { id: 'footer-col-orders', fields: { heading: 'Orders' } },
      { id: 'footer-col-studio', fields: { heading: 'Studio' } },
    ],
  },
  {
    key: 'global.footer.shop-links',
    label: 'Shop column links',
    itemFields: [
      { key: 'label', label: 'Label', type: 'text', maxLength: 32, required: true },
      { key: 'href', label: 'Link', type: 'link', maxLength: 120, required: true },
    ],
    items: [
      { id: 'f-shop-1', fields: { label: 'All products', href: '/shop' } },
      { id: 'f-shop-2', fields: { label: 'Origami', href: '/shop?category=origami' } },
      { id: 'f-shop-3', fields: { label: 'Paper table', href: '/shop?category=table' } },
      { id: 'f-shop-4', fields: { label: 'Gift and wrap', href: '/shop?category=gift' } },
    ],
  },
  {
    key: 'global.footer.orders-links',
    label: 'Orders column links',
    itemFields: [
      { key: 'label', label: 'Label', type: 'text', maxLength: 32, required: true },
      { key: 'href', label: 'Link', type: 'link', maxLength: 120, required: true },
    ],
    items: [
      { id: 'f-orders-1', fields: { label: 'Party packs', href: '/shop?category=party' } },
      { id: 'f-orders-2', fields: { label: 'Bulk pricing', href: '/#bulk' } },
      { id: 'f-orders-3', fields: { label: 'Delivery', href: '/#faq' } },
      { id: 'f-orders-4', fields: { label: 'FAQ', href: '/#faq' } },
    ],
  },
  {
    key: 'global.footer.studio-links',
    label: 'Studio column links',
    itemFields: [
      { key: 'label', label: 'Label', type: 'text', maxLength: 32, required: true },
      { key: 'href', label: 'Link', type: 'link', maxLength: 120, required: true },
    ],
    items: [
      { id: 'f-studio-1', fields: { label: 'About the folds', href: '/#process' } },
      { id: 'f-studio-2', fields: { label: 'Why paper', href: '/#why' } },
      { id: 'f-studio-3', fields: { label: 'Custom work', href: '/#bulk' } },
      { id: 'f-studio-4', fields: { label: 'Blog', href: '/blog' } },
      { id: 'f-studio-5', fields: { label: 'Contact', href: '/#footer-contact' } },
    ],
  },
];

/* ==================================================================
   HOME
   ================================================================== */

const homeFields: ContentField[] = [
  // ---- hero (site.ts hero + Hero.tsx JSX) ----
  { key: 'home.hero.eyebrow', label: 'Eyebrow', type: 'text', value: 'Paper studio / Lagos / Est. 2019', maxLength: 60, required: true },
  { key: 'home.hero.headline.0', label: 'Headline line 1', type: 'text', value: 'Folded by hand,', maxLength: 40, required: true },
  { key: 'home.hero.headline.1', label: 'Headline line 2', type: 'text', value: 'shipped from Lagos.', maxLength: 40, required: true },
  { key: 'home.hero.emphasis-word', label: 'Italic emphasis word', type: 'text', value: 'shipped', maxLength: 24, required: true },
  {
    key: 'home.hero.subline',
    label: 'Subline',
    type: 'longtext',
    value:
      'Origami cranes, pressed paper plates, party packs and gift wrap. Counted, stacked and wrapped to order — then sent to you on WhatsApp.',
    maxLength: 260,
    required: true,
  },
  { key: 'home.hero.primary-cta.label', label: 'Primary button label', type: 'text', value: 'Shop paper goods', maxLength: 32, required: true },
  { key: 'home.hero.primary-cta.href', label: 'Primary button link', type: 'link', value: '/#shop', maxLength: 120, required: true },
  { key: 'home.hero.secondary-cta.label', label: 'Secondary button label', type: 'text', value: 'Custom origami orders', maxLength: 32, required: true },
  { key: 'home.hero.secondary-cta.href', label: 'Secondary button link', type: 'link', value: '/#bulk', maxLength: 120, required: true },
  { key: 'home.hero.art-caption-left', label: 'Art caption, left', type: 'text', value: 'Hover, then scroll', maxLength: 32, required: true },
  { key: 'home.hero.art-caption-right', label: 'Art caption, right', type: 'text', value: 'Procedural · no files', maxLength: 32, required: true },

  // ---- categories (site.ts sections.categories + Categories.tsx JSX) ----
  { key: 'home.categories.index', label: 'Section index', type: 'text', value: '01', maxLength: 4, required: true },
  { key: 'home.categories.title.0', label: 'Title line 1', type: 'text', value: 'What we', maxLength: 30, required: true },
  { key: 'home.categories.title.1', label: 'Title line 2', type: 'text', value: 'actually make', maxLength: 30, required: true },
  {
    key: 'home.categories.lede',
    label: 'Lede',
    type: 'longtext',
    value: 'Six shelves, one studio, two presses. Open a row to see what is under it.',
    maxLength: 200,
    required: true,
  },
  {
    key: 'home.categories.empty-body',
    label: 'Unpriced category body',
    type: 'longtext',
    value:
      'Nothing is priced in the shop for this one, because the number depends on your guest count. Tell us the count and we will quote it the same day.',
    maxLength: 240,
    required: true,
  },
  { key: 'home.categories.empty-cta', label: 'Unpriced category link', type: 'text', value: 'See bulk pricing', maxLength: 32, required: true },
  { key: 'home.categories.bulk-count-label', label: 'Zero-count row suffix', type: 'text', value: 'Bulk', maxLength: 8, required: true },

  // ---- featured (site.ts sections.shop + FeaturedProducts.tsx JSX) ----
  { key: 'home.featured.index', label: 'Section index', type: 'text', value: '02', maxLength: 4, required: true },
  { key: 'home.featured.title.0', label: 'Title', type: 'text', value: 'The shop', maxLength: 30, required: true },
  { key: 'home.featured.lede', label: 'Lede', type: 'longtext', value: 'Everything below ships flat. Prices include the folding.', maxLength: 200, required: true },
  {
    key: 'home.featured.count-note',
    label: 'Count note',
    type: 'longtext',
    value:
      'That is {shown} of {total}. The rest — a 7-inch plate, an 8oz cup, paper spoons, the gift-wrap pack — sit in the index above.',
    maxLength: 220,
    required: true,
    tokens: ['shown', 'total'],
  },
  {
    key: 'home.featured.all-link',
    label: '"See all" link label',
    type: 'text',
    value: 'See all {total} in the shop',
    maxLength: 40,
    required: true,
    tokens: ['total'],
  },

  // ---- process (site.ts sections.process + processSteps + Process.tsx JSX) ----
  { key: 'home.process.index', label: 'Section index', type: 'text', value: '03', maxLength: 4, required: true },
  { key: 'home.process.title.0', label: 'Title line 1', type: 'text', value: 'How an order', maxLength: 30, required: true },
  { key: 'home.process.title.1', label: 'Title line 2', type: 'text', value: 'gets folded', maxLength: 30, required: true },
  { key: 'home.process.lede', label: 'Lede', type: 'longtext', value: 'Scroll. The sheet folds the way the work does.', maxLength: 200, required: true },
  { key: 'home.process.footnote', label: 'Delivery footnote', type: 'text', value: 'Lagos 24 hrs · Nationwide 2–5 working days', maxLength: 60, required: true },
  { key: 'home.process.fold-prefix', label: 'Fold counter prefix', type: 'text', value: 'Fold', maxLength: 8, required: true },
  { key: 'home.process.scroll-hint', label: 'Scroll hint', type: 'text', value: 'Scroll to fold', maxLength: 32, required: true },

  // ---- bulk band (site.ts sections.bulk + BulkBand.tsx JSX) ----
  { key: 'home.bulk.index', label: 'Section index', type: 'text', value: '04', maxLength: 4, required: true },
  { key: 'home.bulk.title.0', label: 'Title line 1', type: 'text', value: 'Bulk and', maxLength: 30, required: true },
  { key: 'home.bulk.title.1', label: 'Title line 2', type: 'text', value: 'events', maxLength: 30, required: true },
  {
    key: 'home.bulk.lede',
    label: 'Lede',
    type: 'longtext',
    value: 'For weddings, naming ceremonies, school events and small businesses buying monthly.',
    maxLength: 200,
    required: true,
  },
  { key: 'home.bulk.turnaround-label', label: '"Turnaround" label', type: 'text', value: 'Turnaround', maxLength: 24, required: true },
  { key: 'home.bulk.turnaround-value', label: 'Turnaround value', type: 'text', value: '3–7 days', maxLength: 24, required: true },
  { key: 'home.bulk.free-delivery-label', label: '"Free Lagos delivery" label', type: 'text', value: 'Free Lagos delivery', maxLength: 32, required: true },
  { key: 'home.bulk.cta-label', label: 'CTA button label', type: 'text', value: 'Send us the guest count', maxLength: 40, required: true },
  { key: 'home.bulk.events-heading', label: '"What people order" heading', type: 'text', value: 'What people order', maxLength: 32, required: true },
  { key: 'home.bulk.tiers-heading', label: '"Volume pricing" heading', type: 'text', value: 'Volume pricing', maxLength: 32, required: true },
  { key: 'home.bulk.tiers-note', label: 'Tier table note', type: 'text', value: 'Applied to the order total · from 50 units', maxLength: 80, required: true },
  { key: 'home.bulk.table-units', label: 'Table header: units', type: 'text', value: 'Units', maxLength: 16, required: true },
  { key: 'home.bulk.table-off', label: 'Table header: off', type: 'text', value: 'Off', maxLength: 16, required: true },
  { key: 'home.bulk.table-notes', label: 'Table header: notes', type: 'text', value: 'Notes', maxLength: 16, required: true },
  { key: 'home.bulk.table-example', label: 'Table header: example', type: 'text', value: 'Example at ₦700', maxLength: 32, required: true },
  {
    key: 'home.bulk.footnote',
    label: 'Example pricing footnote',
    type: 'longtext',
    value:
      'Example column prices ₦700 per guest, which is roughly a party pack plus a plate of food. Your number will differ; we quote it from your list, not from ours.',
    maxLength: 260,
    required: true,
  },
  { key: 'home.bulk.divider-label', label: 'Fold divider label', type: 'text', value: 'Fold here before you order', maxLength: 40, required: true },

  // ---- why (site.ts sections.why + whyPoints) ----
  { key: 'home.why.index', label: 'Section index', type: 'text', value: '05', maxLength: 4, required: true },
  { key: 'home.why.title.0', label: 'Title', type: 'text', value: 'Why paper', maxLength: 30, required: true },
  { key: 'home.why.lede', label: 'Lede', type: 'longtext', value: 'Three reasons, none of them about the planet in a general way.', maxLength: 200, required: true },

  // ---- testimonials (site.ts sections.testimonials + testimonials) ----
  { key: 'home.testimonials.index', label: 'Section index', type: 'text', value: '06', maxLength: 4, required: true },
  { key: 'home.testimonials.title.0', label: 'Title', type: 'text', value: 'Said about us', maxLength: 30, required: true },
  { key: 'home.testimonials.placeholder-chip', label: 'Placeholder chip', type: 'text', value: 'Placeholder', maxLength: 16, required: true },
  {
    key: 'home.testimonials.lede',
    label: 'Lede',
    type: 'longtext',
    value: 'Three placeholders until these are real. Swap them in /data/site.ts.',
    maxLength: 200,
    required: true,
  },

  // ---- faq (site.ts sections.faq + Faq.tsx JSX) ----
  { key: 'home.faq.index', label: 'Section index', type: 'text', value: '07', maxLength: 4, required: true },
  { key: 'home.faq.title.0', label: 'Title line 1', type: 'text', value: 'Questions people', maxLength: 30, required: true },
  { key: 'home.faq.title.1', label: 'Title line 2', type: 'text', value: 'actually ask', maxLength: 30, required: true },
  { key: 'home.faq.lede', label: 'Lede', type: 'longtext', value: 'If yours is not here, message the studio on WhatsApp.', maxLength: 200, required: true },
  { key: 'home.faq.card-eyebrow', label: 'Side card eyebrow', type: 'text', value: 'Still stuck', maxLength: 24, required: true },
  { key: 'home.faq.card-title', label: 'Side card title', type: 'text', value: 'Ask a person who folds the paper.', maxLength: 60, required: true },
  {
    key: 'home.faq.card-body',
    label: 'Side card body',
    type: 'longtext',
    value:
      'Messages go to the studio in Surulere, not to a queue. Send a photo of your event colours and we will tell you what we can actually make, and what it costs.',
    maxLength: 280,
    required: true,
  },
  { key: 'home.faq.card-cta', label: 'Side card button', type: 'text', value: 'Message the studio', maxLength: 32, required: true },
  { key: 'home.faq.card-caption', label: 'Side card caption', type: 'text', value: '+234 XXXX XXX XXXX · Replies same day', maxLength: 48, required: true },
];

const homeLists: ContentList[] = [
  // hero stats (site.ts hero.stats)
  {
    key: 'home.hero.stats',
    label: 'Hero stats',
    itemFields: [
      { key: 'value', label: 'Value', type: 'text', maxLength: 12, required: true, tokens: ['total'] },
      { key: 'label', label: 'Label', type: 'text', maxLength: 40, required: true },
    ],
    items: [
      { id: 'hero-stat-1', fields: { value: '{total}', label: 'products in the shop' } },
      { id: 'hero-stat-2', fields: { value: '₦1,500', label: 'for one crane, folded by hand' } },
      { id: 'hero-stat-3', fields: { value: '24 hrs', label: 'Lagos turnaround on party packs' } },
    ],
  },
  // hero's own marquee strip (Hero.tsx renders <Marquee /> with the
  // default site.marqueeWords — separate from the mid-page 4-word strip)
  {
    key: 'home.hero.marquee.words',
    label: 'Hero marquee words',
    itemFields: [{ key: 'word', label: 'Word', type: 'text', maxLength: 40, required: true }],
    items: [
      { id: 'hero-mq-1', fields: { word: 'Handfolded in Lagos' } },
      { id: 'hero-mq-2', fields: { word: 'Counted into packs' } },
      { id: 'hero-mq-3', fields: { word: 'Delivery across Nigeria' } },
      { id: 'hero-mq-4', fields: { word: 'Bagasse and recycled kraft' } },
      { id: 'hero-mq-5', fields: { word: 'No payment gateway' } },
      { id: 'hero-mq-6', fields: { word: 'Free Lagos delivery over ₦50,000' } },
    ],
  },
  // mid-page marquee (app/page.tsx literal words)
  {
    key: 'home.marquee.words',
    label: 'Marquee words',
    itemFields: [{ key: 'word', label: 'Word', type: 'text', maxLength: 40, required: true, tokens: ['total'] }],
    items: [
      { id: 'marquee-1', fields: { word: 'One studio' } },
      { id: 'marquee-2', fields: { word: '{total} products' } },
      { id: 'marquee-3', fields: { word: 'No payment gateway' } },
      { id: 'marquee-4', fields: { word: 'Counted by hand' } },
    ],
  },
  // process fold captions (three/fold-steps.ts — rendered under the scrub)
  {
    key: 'home.process.fold-steps',
    label: 'Fold step captions',
    fixed: true,
    itemFields: [{ key: 'name', label: 'Caption', type: 'text', maxLength: 32, required: true }],
    items: [
      { id: 'fold-1', fields: { name: 'Fold in half' } },
      { id: 'fold-2', fields: { name: 'Fold in half again' } },
      { id: 'fold-3', fields: { name: 'Crease both diagonals' } },
      { id: 'fold-4', fields: { name: 'Open to a square' } },
      { id: 'fold-5', fields: { name: 'Collapse the base' } },
      { id: 'fold-6', fields: { name: 'Petal fold' } },
      { id: 'fold-7', fields: { name: 'Petal fold' } },
      { id: 'fold-8', fields: { name: 'Repeat behind' } },
      { id: 'fold-9', fields: { name: 'Reverse fold' } },
      { id: 'fold-10', fields: { name: 'Neck up' } },
      { id: 'fold-11', fields: { name: 'Tail up' } },
      { id: 'fold-12', fields: { name: 'Set the wings' } },
    ],
  },
  // process steps (site.ts processSteps)
  {
    key: 'home.process.steps',
    label: 'Process steps',
    itemFields: [
      { key: 'index', label: 'Index', type: 'text', maxLength: 4, required: true },
      { key: 'title', label: 'Title', type: 'text', maxLength: 60, required: true },
      { key: 'body', label: 'Body', type: 'longtext', maxLength: 400, required: true },
    ],
    items: [
      {
        id: 'process-1',
        fields: {
          index: '01',
          title: 'You send the brief',
          body: 'A WhatsApp message with a guest count, a colour and a date. We reply the same day with a number and a photograph of the finished pack, so there is nothing to imagine.',
        },
      },
      {
        id: 'process-2',
        fields: {
          index: '02',
          title: 'We fold it in Surulere',
          body: 'Three to five working days for a two-hundred guest order. Every crease is made by hand, which is exactly why bulk means we start earlier rather than fold faster.',
        },
      },
      {
        id: 'process-3',
        fields: {
          index: '03',
          title: 'It ships flat or arrives ready',
          body: 'Lagos is same day before 2pm, or collect from the studio. Elsewhere, two to five working days by parcel or bus terminal, still flat, still countable.',
        },
      },
    ],
  },
  // bulk events (BulkBand.tsx events const)
  {
    key: 'home.bulk.events',
    label: '"What people order" rows',
    itemFields: [
      { key: 'label', label: 'Label', type: 'text', maxLength: 32, required: true },
      { key: 'note', label: 'Note', type: 'text', maxLength: 48, required: true },
    ],
    items: [
      { id: 'bulk-event-1', fields: { label: 'Weddings', note: 'Tableware and favour tags' } },
      { id: 'bulk-event-2', fields: { label: 'Naming ceremonies', note: 'Party packs, 30 to 300' } },
      { id: 'bulk-event-3', fields: { label: 'School events', note: 'Paper packs and bulk plates' } },
      { id: 'bulk-event-4', fields: { label: 'Small businesses', note: 'Monthly wrap and box orders' } },
    ],
  },
  // bulk tiers (site.ts bulkTiers via products.ts) — editable numbers
  {
    key: 'home.bulk.tiers',
    label: 'Volume pricing tiers',
    itemFields: [
      { key: 'from', label: 'From (units)', type: 'number', required: true },
      { key: 'to', label: 'To (units, blank = and up)', type: 'text', maxLength: 8, required: false },
      { key: 'discount', label: 'Discount', type: 'text', maxLength: 12, required: true },
      { key: 'note', label: 'Note', type: 'text', maxLength: 60, required: true },
    ],
    items: [
      { id: 'tier-1', fields: { from: 50, to: '99', discount: '5%', note: 'Order total, any mix of lines' } },
      { id: 'tier-2', fields: { from: 100, to: '249', discount: '10%', note: 'Custom colours open at 100' } },
      { id: 'tier-3', fields: { from: 250, to: '499', discount: '15%', note: 'We fold in two shifts' } },
      { id: 'tier-4', fields: { from: 500, to: '', discount: 'Quoted', note: 'Named account, 50% deposit' } },
    ],
  },
  // why points (site.ts whyPoints)
  {
    key: 'home.why.points',
    label: 'Why paper points',
    itemFields: [
      { key: 'index', label: 'Index', type: 'text', maxLength: 4, required: true },
      { key: 'title', label: 'Title', type: 'text', maxLength: 60, required: true },
      { key: 'body', label: 'Body', type: 'longtext', maxLength: 400, required: true },
    ],
    items: [
      {
        id: 'why-1',
        fields: {
          index: '01',
          title: 'It composts in weeks, not centuries',
          body: 'Plates and napkins are pressed from sugarcane bagasse and recycled kraft. After an event they go into a home compost and are gone before the next birthday. Nothing on the table outlives the memory of the table.',
        },
      },
      {
        id: 'why-2',
        fields: {
          index: '02',
          title: 'The fold is the finish',
          body: 'No glue, no staples, no printed logo. A gift box holds a gift because two flaps meet under their own tension, so it opens the same way the third time it did.',
        },
      },
      {
        id: 'why-3',
        fields: {
          index: '03',
          title: 'It packs into a rider bag',
          body: 'Flat is a feature. A fortnight of tableware for a hundred people rides in a courier carton the size of a shoebox, which is a fifth of what the same count in rigid plastic would need.',
        },
      },
    ],
  },
  // testimonials (site.ts testimonials) — placeholder flag kept per item
  {
    key: 'home.testimonials.items',
    label: 'Testimonials',
    itemFields: [
      { key: 'quote', label: 'Quote', type: 'longtext', maxLength: 320, required: true },
      { key: 'name', label: 'Name', type: 'text', maxLength: 40, required: true },
      { key: 'city', label: 'City', type: 'text', maxLength: 40, required: true },
      { key: 'placeholder', label: 'Placeholder copy', type: 'flag', required: false },
    ],
    items: [
      {
        id: 'testimonial-1',
        fields: {
          quote: 'My daughter cried when the two-hundred crane string came in. Real folds, real paper. I ordered another one for her birthday.',
          name: 'Mrs. Adaeze N.',
          city: 'Lekki, Lagos',
          placeholder: true,
        },
      },
      {
        id: 'testimonial-2',
        fields: {
          quote: "We fed a hundred and twenty at a naming ceremony. The plates held hot food and the pack cost less than the caterer's disposables.",
          name: 'Hauwa B.',
          city: 'Kaduna',
          placeholder: true,
        },
      },
      {
        id: 'testimonial-3',
        fields: {
          quote: 'I run a small bakery. The boxes arrive flat, I fold one in ten seconds, and my packaging bill dropped by nearly half.',
          name: 'Tolu A.',
          city: 'Ibadan',
          placeholder: true,
        },
      },
    ],
  },
  // faq items (site.ts faqs via products.ts)
  {
    key: 'home.faq.items',
    label: 'FAQ items',
    itemFields: [
      { key: 'question', label: 'Question', type: 'text', maxLength: 120, required: true },
      { key: 'answer', label: 'Answer', type: 'longtext', maxLength: 600, required: true },
    ],
    items: [
      {
        id: 'faq-1',
        fields: {
          question: 'How do I pay?',
          answer: 'There is no payment gateway on this site. We confirm your order on WhatsApp first, then you pay by bank transfer, by cash at the Lagos studio, or by POS if you want to collect in person. Nothing is folded, and nothing ships, until the transfer clears.',
        },
      },
      {
        id: 'faq-2',
        fields: {
          question: 'How long does delivery take?',
          answer: 'Lagos is same day when you order before 2pm. Abuja, Port Harcourt and Ibadan are two to three working days by parcel. Everywhere else in Nigeria is three to five working days, and we will hand it to a bus terminal if that is cheaper for you. A 200-guest party pack needs five to seven working days before it is ready.',
        },
      },
      {
        id: 'faq-3',
        fields: {
          question: 'Can you make it in our colours?',
          answer: 'Yes, from 200 units. Send a hex code or a photograph of your event colours and we will press to that shade. Custom colour adds five to seven working days because the sheets have to be dyed and dried before anyone folds them.',
        },
      },
      {
        id: 'faq-4',
        fields: {
          question: 'What does bulk pricing look like?',
          answer: 'Five per cent off from 50 units, ten from 100, fifteen from 250, and a quoted rate from 500. The discount applies to the order total rather than to each line, so mixing lines still counts. Lagos delivery is free over fifty thousand naira.',
        },
      },
      {
        id: 'faq-5',
        fields: {
          question: 'What if the paper arrives creased?',
          answer: 'Paper does crease in transit. Send a photograph within 24 hours of delivery and we will replace the pack free, or refund it in full if you have already opened it. You do not have to argue about it and we do not ask you to keep the damaged pack.',
        },
      },
      {
        id: 'faq-6',
        fields: {
          question: 'Do you fold custom designs?',
          answer: 'We do. Send a sketch, a logo or a photograph of the thing you want and we will fold one as a sample before quoting the rest. Custom folds start at three days for a sample and ten days for a run of fifty.',
        },
      },
    ],
  },
];

/* ==================================================================
   SHOP
   ================================================================== */

const shopFields: ContentField[] = [
  // header (site.ts shopPage)
  { key: 'shop.header.index', label: 'Section index', type: 'text', value: '01', maxLength: 4, required: true },
  { key: 'shop.header.title.0', label: 'Title line 1', type: 'text', value: 'The', maxLength: 30, required: true },
  { key: 'shop.header.title.1', label: 'Title line 2', type: 'text', value: 'stockroom', maxLength: 30, required: true },
  {
    key: 'shop.header.lede',
    label: 'Lede',
    type: 'longtext',
    value: '{total} products. Every one ships flat.',
    maxLength: 120,
    required: true,
    tokens: ['total'],
  },

  // shelf toolbar + rail (site.ts shopPage + ShopShelf.tsx JSX)
  { key: 'shop.shelf.rail-label', label: 'Rail heading', type: 'text', value: 'The shelf index', maxLength: 32, required: true },
  { key: 'shop.shelf.all-tab', label: '"All" tab label', type: 'text', value: 'All', maxLength: 16, required: true },
  { key: 'shop.shelf.sort-label', label: 'Sort label', type: 'text', value: 'Sort by', maxLength: 16, required: true },
  { key: 'shop.shelf.search-label', label: 'Search label', type: 'text', value: 'Search the shelf', maxLength: 32, required: true },
  { key: 'shop.shelf.search-placeholder', label: 'Search placeholder', type: 'text', value: 'Crane, plates, gift…', maxLength: 32, required: true },
  { key: 'shop.shelf.search-button', label: 'Search button', type: 'text', value: 'Search', maxLength: 16, required: true },
  { key: 'shop.shelf.search-clear', label: 'Search clear button', type: 'text', value: 'Clear', maxLength: 16, required: true },
  {
    key: 'shop.shelf.no-results',
    label: 'No results message',
    type: 'longtext',
    value: 'Nothing on the shelf matches that search. Try another word, or see everything at once.',
    maxLength: 200,
    required: true,
  },
  { key: 'shop.shelf.no-results-cta', label: 'No results link', type: 'text', value: 'Show all products', maxLength: 32, required: true },
  {
    key: 'shop.shelf.empty-bulk',
    label: 'Unpriced shelf message',
    type: 'longtext',
    value:
      'Nothing sits on this shelf with a price, because the number depends on your guest count. Tell us the count and we will quote it the same day.',
    maxLength: 240,
    required: true,
  },
  { key: 'shop.shelf.empty-bulk-cta', label: 'Unpriced shelf link', type: 'text', value: 'See bulk pricing', maxLength: 32, required: true },
];

const shopLists: ContentList[] = [
  {
    key: 'shop.shelf.sort-options',
    label: 'Sort options',
    fixed: true,
    itemFields: [{ key: 'label', label: 'Label', type: 'text', maxLength: 32, required: true }],
    items: [
      { id: 'sort-featured', fields: { label: 'Featured' } },
      { id: 'sort-asc', fields: { label: 'Price, low to high' } },
      { id: 'sort-desc', fields: { label: 'Price, high to low' } },
    ],
  },
];

/* ==================================================================
   BLOG
   ================================================================== */

const blogFields: ContentField[] = [
  // header (site.ts blogPage)
  { key: 'blog.header.index', label: 'Section index', type: 'text', value: '01', maxLength: 4, required: true },
  { key: 'blog.header.title.0', label: 'Title line 1', type: 'text', value: 'The', maxLength: 30, required: true },
  { key: 'blog.header.title.1', label: 'Title line 2', type: 'text', value: 'folio', maxLength: 30, required: true },
  {
    key: 'blog.header.lede',
    label: 'Lede',
    type: 'longtext',
    value:
      'Notes from the stockroom: counting, pressing, folding, pricing and shipping, written down between orders. Placeholders until the studio writes its own — swap them in /data/posts.ts.',
    maxLength: 280,
    required: true,
  },

  // lead band (blog/page.tsx JSX)
  { key: 'blog.lead.read-link', label: '"Read the note" link', type: 'text', value: 'Read the note', maxLength: 32, required: true },
  { key: 'blog.lead.label-published', label: 'Meta label: published', type: 'text', value: 'Published', maxLength: 16, required: true },
  { key: 'blog.lead.label-reading', label: 'Meta label: reading', type: 'text', value: 'Reading', maxLength: 16, required: true },
  { key: 'blog.lead.label-filed', label: 'Meta label: filed under', type: 'text', value: 'Filed under', maxLength: 16, required: true },
  { key: 'blog.lead.min-suffix', label: 'Reading time suffix', type: 'text', value: 'min', maxLength: 8, required: true },
  { key: 'blog.lead.placeholder-chip', label: 'Placeholder chip', type: 'text', value: 'Placeholder', maxLength: 16, required: true },
  { key: 'blog.more.heading', label: '"More notes" heading', type: 'text', value: 'More notes', maxLength: 32, required: true },

  // post template (blog/[slug]/page.tsx JSX + site.ts blogPage)
  { key: 'blog.post.breadcrumb-home', label: 'Breadcrumb: home', type: 'text', value: 'Home', maxLength: 16, required: true },
  { key: 'blog.post.related-label', label: '"Products in this note" heading', type: 'text', value: 'Products in this note', maxLength: 32, required: true },
  { key: 'blog.post.all-notes-label', label: '"All notes" link', type: 'text', value: 'All notes', maxLength: 24, required: true },
  { key: 'blog.post.min-read-suffix', label: 'Reading time suffix', type: 'text', value: 'min read', maxLength: 16, required: true },
  { key: 'blog.post.placeholder-chip', label: 'Placeholder chip', type: 'text', value: 'Placeholder', maxLength: 16, required: true },

  // closing (site.ts blogPage.closing)
  { key: 'blog.closing.line', label: 'Closing line', type: 'text', value: 'A question about any of this goes to the studio, not to a queue.', maxLength: 120, required: true },
  { key: 'blog.closing.cta-label', label: 'Closing button', type: 'text', value: 'Message the studio', maxLength: 32, required: true },
  { key: 'blog.closing.caption', label: 'Closing caption', type: 'text', value: 'Replies same day', maxLength: 24, required: true },
];

const blogLists: ContentList[] = [
  {
    // blog/index marquee — the storefront renders <Marquee /> with the
    // default words from site.ts marqueeWords
    key: 'blog.closing.marquee.words',
    label: 'Closing marquee words',
    itemFields: [{ key: 'word', label: 'Word', type: 'text', maxLength: 40, required: true }],
    items: [
      { id: 'blog-mq-1', fields: { word: 'Handfolded in Lagos' } },
      { id: 'blog-mq-2', fields: { word: 'Counted into packs' } },
      { id: 'blog-mq-3', fields: { word: 'Delivery across Nigeria' } },
      { id: 'blog-mq-4', fields: { word: 'Bagasse and recycled kraft' } },
      { id: 'blog-mq-5', fields: { word: 'No payment gateway' } },
      { id: 'blog-mq-6', fields: { word: 'Free Lagos delivery over ₦50,000' } },
    ],
  },
];

/* ==================================================================
   ABOUT
   ================================================================== */

const aboutFields: ContentField[] = [
  // hero (site.ts aboutPage.hero + AboutHero.tsx JSX)
  { key: 'about.hero.eyebrow', label: 'Eyebrow', type: 'text', value: 'The studio / Surulere / Est. 2019', maxLength: 60, required: true },
  { key: 'about.hero.headline.0', label: 'Headline line 1', type: 'text', value: 'Paper, folded', maxLength: 40, required: true },
  { key: 'about.hero.headline.1', label: 'Headline line 2', type: 'text', value: 'in Surulere', maxLength: 40, required: true },
  { key: 'about.hero.emphasis-word', label: 'Italic emphasis word', type: 'text', value: 'Surulere', maxLength: 24, required: true },
  {
    key: 'about.hero.subline',
    label: 'Subline',
    type: 'longtext',
    value:
      'One room, two presses and a table of counting paper. Everything on this site is folded, pressed, counted and banded by the people who answer your messages.',
    maxLength: 260,
    required: true,
  },
  { key: 'about.hero.art-caption', label: 'Art caption', type: 'text', value: 'One crane, folded in the studio', maxLength: 40, required: true },
  { key: 'about.hero.art-note', label: 'Art note', type: 'text', value: 'Drawn, not photographed', maxLength: 32, required: true },

  // sheet (site.ts aboutPage.sheet)
  { key: 'about.sheet.index', label: 'Section index', type: 'text', value: '01', maxLength: 4, required: true },
  { key: 'about.sheet.title.0', label: 'Title line 1', type: 'text', value: 'The studio', maxLength: 30, required: true },
  { key: 'about.sheet.title.1', label: 'Title line 2', type: 'text', value: 'sheet', maxLength: 30, required: true },
  { key: 'about.sheet.lede', label: 'Lede', type: 'longtext', value: 'One crease, four folds: the room, the start, the orders, the bulk.', maxLength: 200, required: true },

  // numbers (site.ts aboutPage.numbersIndex/Title + about/page.tsx labels)
  { key: 'about.numbers.index', label: 'Section index', type: 'text', value: '02', maxLength: 4, required: true },
  { key: 'about.numbers.title', label: 'Heading', type: 'text', value: 'In numbers', maxLength: 24, required: true },

  // facts (site.ts aboutPage.facts + about/page.tsx JSX)
  { key: 'about.facts.index', label: 'Section index', type: 'text', value: '06', maxLength: 4, required: true },
  { key: 'about.facts.title.0', label: 'Title line 1', type: 'text', value: 'The facts,', maxLength: 30, required: true },
  { key: 'about.facts.title.1', label: 'Title line 2', type: 'text', value: 'and the door', maxLength: 30, required: true },
  { key: 'about.facts.lede', label: 'Lede', type: 'longtext', value: 'The same address, number and handle printed on the packaging.', maxLength: 200, required: true },
  { key: 'about.facts.card-label', label: 'Card eyebrow', type: 'text', value: 'Ask the studio', maxLength: 24, required: true },
  { key: 'about.facts.card-title', label: 'Card title', type: 'text', value: 'A person who folds the paper answers.', maxLength: 60, required: true },
  {
    key: 'about.facts.card-body',
    label: 'Card body',
    type: 'longtext',
    value:
      'Messages go to the studio in Surulere, not to a queue. Send a guest count, a colour or a photograph and you will hear back the same day.',
    maxLength: 280,
    required: true,
  },
  { key: 'about.facts.card-cta', label: 'Card button', type: 'text', value: 'Message the studio', maxLength: 32, required: true },
  { key: 'about.facts.card-caption', label: 'Card caption', type: 'text', value: '+234 XXXX XXX XXXX · Replies same day', maxLength: 48, required: true },

  // closing (site.ts aboutPage.closing)
  { key: 'about.closing.title.0', label: 'Title line 1', type: 'text', value: 'The paper is', maxLength: 30, required: true },
  { key: 'about.closing.title.1', label: 'Title line 2', type: 'text', value: 'on the table', maxLength: 30, required: true },
  { key: 'about.closing.primary-label', label: 'Primary button', type: 'text', value: 'Shop paper goods', maxLength: 32, required: true },
  { key: 'about.closing.primary-href', label: 'Primary button link', type: 'link', value: '/shop', maxLength: 120, required: true },
  { key: 'about.closing.secondary-label', label: 'Secondary button', type: 'text', value: 'Message the studio', maxLength: 32, required: true },
];

const aboutLists: ContentList[] = [
  {
    // about/index marquee — <Marquee /> with the default words
    key: 'about.hero.marquee.words',
    label: 'Hero marquee words',
    itemFields: [{ key: 'word', label: 'Word', type: 'text', maxLength: 40, required: true }],
    items: [
      { id: 'about-mq-1', fields: { word: 'Handfolded in Lagos' } },
      { id: 'about-mq-2', fields: { word: 'Counted into packs' } },
      { id: 'about-mq-3', fields: { word: 'Delivery across Nigeria' } },
      { id: 'about-mq-4', fields: { word: 'Bagasse and recycled kraft' } },
      { id: 'about-mq-5', fields: { word: 'No payment gateway' } },
      { id: 'about-mq-6', fields: { word: 'Free Lagos delivery over ₦50,000' } },
    ],
  },
  // sheet stations (site.ts aboutPage.sheet.stations)
  {
    key: 'about.sheet.stations',
    label: 'Studio sheet stations',
    itemFields: [
      { key: 'index', label: 'Index', type: 'text', maxLength: 4, required: true },
      { key: 'title', label: 'Title', type: 'text', maxLength: 60, required: true },
      { key: 'body', label: 'Body', type: 'longtext', maxLength: 500, required: true },
    ],
    items: [
      {
        id: 'station-1',
        fields: {
          index: '01',
          title: 'The room on Glover Road',
          body: 'Everything sold here leaves from one address: No. 14, Glover Road, Surulere, Lagos. Six shelves, two presses and a cutting table — the folding, the pressing and the counting happen in the same room, at the same table, usually on the same day.',
        },
      },
      {
        id: 'station-2',
        fields: {
          index: '02',
          title: 'Folding since 2019',
          body: 'The studio has folded paper for money since 2019. Cranes, boxes, plates and party packs have gone out of the same Surulere room since then — what changed is the number of shelves, not the method.',
        },
      },
      {
        id: 'station-3',
        fields: {
          index: '03',
          title: 'An order starts as a message',
          body: 'There is no payment gateway anywhere on this site. An order starts on WhatsApp, gets confirmed the same day with a number and a photograph of the finished pack, and is paid by bank transfer, at the studio, or by POS. Nothing is folded and nothing ships until the transfer clears.',
        },
      },
      {
        id: 'station-4',
        fields: {
          index: '04',
          title: 'Bulk is booked, not rushed',
          body: 'Bulk runs start earlier rather than fold faster: three to five working days for a two-hundred guest order. Volume pricing starts at fifty units — five per cent off, ten from a hundred, fifteen from two hundred and fifty — and applies to the whole order, so mixing lines still counts. From five hundred units the rate is quoted, on a named account with a fifty per cent deposit.',
        },
      },
    ],
  },
  // numbers fact labels (values computed on the storefront)
  {
    key: 'about.numbers.facts',
    label: '"In numbers" labels',
    fixed: true,
    itemFields: [{ key: 'label', label: 'Label', type: 'text', maxLength: 40, required: true }],
    items: [
      { id: 'num-1', fields: { label: 'Studio founded' } },
      { id: 'num-2', fields: { label: 'Products in the shop' } },
      { id: 'num-3', fields: { label: 'Free Lagos delivery over' } },
      { id: 'num-4', fields: { label: 'Lagos turnaround' } },
    ],
  },
  // facts dl row labels (values come from settings)
  {
    key: 'about.facts.rows',
    label: 'Facts row labels',
    fixed: true,
    itemFields: [{ key: 'label', label: 'Label', type: 'text', maxLength: 24, required: true }],
    items: [
      { id: 'fact-row-1', fields: { label: 'Studio' } },
      { id: 'fact-row-2', fields: { label: 'City' } },
      { id: 'fact-row-3', fields: { label: 'WhatsApp' } },
      { id: 'fact-row-4', fields: { label: 'Email' } },
      { id: 'fact-row-5', fields: { label: 'Instagram' } },
    ],
  },
];

/* ==================================================================
   PRODUCT TEMPLATE — products/[slug]/page.tsx JSX
   ================================================================== */

const productFields: ContentField[] = [
  { key: 'product.buy.add-label', label: '"Add to order" button', type: 'text', value: 'Add to order', maxLength: 32, required: true },
  { key: 'product.buy.added-label', label: 'Button label after adding', type: 'text', value: 'Added', maxLength: 16, required: true },
  {
    key: 'product.buy.whatsapp-note',
    label: 'Under-button note',
    type: 'longtext',
    value: 'Nothing is charged here. The order arrives on WhatsApp for confirmation.',
    maxLength: 160,
    required: true,
  },
  { key: 'product.buy.bulk-cta', label: 'Bulk pricing button', type: 'text', value: 'Ask about bulk pricing', maxLength: 40, required: true },
  { key: 'product.detail.heading', label: '"The detail" heading', type: 'text', value: 'The detail', maxLength: 24, required: true },
  { key: 'product.specification.heading', label: '"Specification" heading', type: 'text', value: 'Specification', maxLength: 24, required: true },
  { key: 'product.specification.size-label', label: 'Size row label', type: 'text', value: 'Size', maxLength: 16, required: true },
  { key: 'product.related.heading', label: '"More like this" heading', type: 'text', value: 'More like this', maxLength: 32, required: true },
  { key: 'product.related.all-link', label: '"All categories" link', type: 'text', value: 'All categories', maxLength: 24, required: true },
  { key: 'product.breadcrumb.home-label', label: 'Breadcrumb: home', type: 'text', value: 'Home', maxLength: 16, required: true },
];

/* ==================================================================
   TRACKER — page shell, placeholder copy until the storefront page lands
   ================================================================== */

const trackerFields: ContentField[] = [
  { key: 'tracker.header.title', label: 'Page title', type: 'text', value: 'Track your order', maxLength: 60, required: true, placeholder: true },
  {
    key: 'tracker.header.lede',
    label: 'Page lede',
    type: 'longtext',
    value: 'Enter the reference from your confirmation message to see where the order is.',
    maxLength: 240,
    required: true,
    placeholder: true,
  },
  { key: 'tracker.search.order-ref-label', label: 'Order reference label', type: 'text', value: 'Order reference', maxLength: 32, required: true, placeholder: true },
  { key: 'tracker.search.order-ref-placeholder', label: 'Order reference placeholder', type: 'text', value: 'CH-1042', maxLength: 32, required: true, placeholder: true },
  { key: 'tracker.search.button-label', label: 'Search button', type: 'text', value: 'Track order', maxLength: 24, required: true, placeholder: true },
  {
    key: 'tracker.search.not-found',
    label: '"Not found" message',
    type: 'longtext',
    value: 'No order found with that reference. Check the number, or message the studio on WhatsApp.',
    maxLength: 200,
    required: true,
    placeholder: true,
  },
];

const trackerLists: ContentList[] = [
  {
    // customer-facing status labels, matching ORDER_STATUSES order
    key: 'tracker.statuses',
    label: 'Status labels',
    fixed: true,
    placeholder: true,
    itemFields: [{ key: 'label', label: 'Label', type: 'text', maxLength: 24, required: true }],
    items: [
      { id: 'status-pending', fields: { label: 'Pending' } },
      { id: 'status-confirmed', fields: { label: 'Confirmed' } },
      { id: 'status-transit', fields: { label: 'In transit' } },
      { id: 'status-delivered', fields: { label: 'Delivered' } },
      { id: 'status-cancelled', fields: { label: 'Cancelled' } },
    ],
  },
];

/* ==================================================================
   Exports
   ================================================================== */

export const contentFields: ContentField[] = [
  ...globalFields,
  ...homeFields,
  ...shopFields,
  ...blogFields,
  ...aboutFields,
  ...productFields,
  ...trackerFields,
];

export const contentLists: ContentList[] = [
  ...globalLists,
  ...homeLists,
  ...shopLists,
  ...blogLists,
  ...aboutLists,
  ...trackerLists,
];

/** Seed maps keyed by content key — the provider's starting state. */
export const fieldSeed: Record<string, string | number> = Object.fromEntries(
  contentFields.map((f) => [f.key, f.value])
);

export const listSeed: Record<string, ContentList> = Object.fromEntries(
  contentLists.map((l) => [l.key, l])
);
