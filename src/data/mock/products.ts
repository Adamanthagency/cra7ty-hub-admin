import type { Product } from '@/lib/types';

/**
 * Six products lifted from the storefront catalogue (names, prices and
 * categories match src/data/products.ts in the main repo). Each carries
 * at least two variants. Prices are whole naira.
 */
export const products: Product[] = [
  {
    id: 'crane-string-20',
    name: 'Origami crane string, 20 pieces',
    description:
      'Twenty cranes on cotton thread, strung and knotted ready to hang across a doorway.',
    category: 'origami',
    price: 12000,
    stock: 14,
    status: 'active',
    variants: [
      { id: 'crane-string-thread-natural', type: 'material', value: 'Natural cotton', stock: 8, active: true },
      { id: 'crane-string-thread-waxed', type: 'material', value: 'Waxed cotton', stock: 6, active: true },
      { id: 'crane-string-colour-kraft', type: 'colour', value: 'Kraft', hex: '#d9c7a7', stock: 10, active: true },
      { id: 'crane-string-colour-vermilion', type: 'colour', value: 'Vermilion', hex: '#e5391f', stock: 4, active: true },
    ],
    tags: ['garland', 'doorway', 'wedding'],
    images: [],
    seo: {
      metaTitle: 'Origami crane string, 20 pieces — Cra7ty Hub',
      metaDescription: 'Twenty handfolded cranes on waxed cotton cord, strung ready to hang. Folded in Lagos.',
    },
    updatedAt: '2026-10-18T09:30:00Z',
  },
  {
    id: 'flower-bouquet-12',
    name: 'Paper flower bouquet, 12 stems',
    description:
      'Twelve folded stems in kraft and vermilion, banded with a paper wrap and a twine tie.',
    category: 'origami',
    price: 9500,
    compareAtPrice: 11000,
    stock: 3,
    status: 'active',
    variants: [
      { id: 'bouquet-tone-two-tone', type: 'colour', value: 'Kraft & vermilion', hex: '#d9c7a7', stock: 3, active: true },
      { id: 'bouquet-tone-moss', type: 'colour', value: 'Moss', hex: '#3e5641', stock: 2, active: true },
      { id: 'bouquet-size-standard', type: 'size', value: 'Standard (12 stems)', stock: 3, active: true },
      { id: 'bouquet-size-grand', type: 'size', value: 'Grand (18 stems)', stock: 1, active: true },
    ],
    tags: ['flowers', 'gift', 'centre-piece'],
    images: [],
    updatedAt: '2026-10-17T15:05:00Z',
  },
  {
    id: 'gift-box-set-5',
    name: 'Origami gift box, set of 5',
    description:
      'Five folding gift boxes in graduated sizes, pressed flat and popped open at the lid.',
    category: 'gift',
    price: 6500,
    stock: 22,
    status: 'active',
    variants: [
      { id: 'gift-box-colour-kraft', type: 'colour', value: 'Kraft', hex: '#d9c7a7', stock: 12, active: true },
      { id: 'gift-box-colour-paper', type: 'colour', value: 'Paper', hex: '#f4efe6', stock: 7, active: true },
      { id: 'gift-box-colour-ink', type: 'colour', value: 'Ink', hex: '#16130f', stock: 3, active: true },
      { id: 'gift-box-size-mixed', type: 'size', value: 'Mixed sizes', stock: 22, active: true },
    ],
    tags: ['gifting', 'boxes'],
    images: [],
    updatedAt: '2026-10-15T11:45:00Z',
  },
  {
    id: 'plates-9in-25',
    name: 'Paper plates, 9-inch (25 pack)',
    description:
      'Pressed bagasse plates with a rolled rim — a plate of jollof does not fold in the hand.',
    category: 'table',
    price: 4500,
    stock: 48,
    status: 'active',
    variants: [
      { id: 'plates-9in-finish-matte', type: 'material', value: 'Matte bagasse', stock: 30, active: true },
      { id: 'plates-9in-finish-ribbed', type: 'material', value: 'Ribbed rim', stock: 18, active: true },
      { id: 'plates-9in-colour-natural', type: 'colour', value: 'Natural', hex: '#d9c7a7', stock: 48, active: true },
    ],
    tags: ['party', 'table', 'bagasse'],
    images: [],
    updatedAt: '2026-10-19T08:20:00Z',
  },
  {
    id: 'party-pack-20',
    name: 'Party pack, 20 guests',
    description:
      'Per guest: 9-inch plate, side plate, spoon, cup and two napkins. Counted into sleeves, counted again.',
    category: 'party',
    price: 18000,
    stock: 2,
    status: 'active',
    variants: [
      { id: 'party-pack-colour-ivory', type: 'colour', value: 'Ivory', hex: '#f4efe6', stock: 2, active: true },
      { id: 'party-pack-colour-kraft', type: 'colour', value: 'Kraft', hex: '#d9c7a7', stock: 4, active: true },
      { id: 'party-pack-size-20', type: 'size', value: '20 guests', stock: 2, active: true },
      { id: 'party-pack-size-50', type: 'size', value: '50 guests', stock: 1, active: true },
    ],
    tags: ['events', 'bulk', 'catering'],
    images: [],
    seo: {
      metaTitle: 'Party pack, 20 guests — Cra7ty Hub',
      metaDescription: 'Plates, cups, spoons and napkins for twenty, counted by hand in Lagos.',
    },
    updatedAt: '2026-10-20T16:40:00Z',
  },
  {
    id: 'origami-paper-100',
    name: 'Origami paper pack, 100 sheets',
    description:
      'One hundred squares of 80 gsm recycled origami paper in a kraft band.',
    category: 'paper',
    price: 3500,
    stock: 0,
    status: 'inactive',
    variants: [
      { id: 'origami-paper-size-15', type: 'size', value: '15 cm', stock: 0, active: true },
      { id: 'origami-paper-size-20', type: 'size', value: '20 cm', stock: 0, active: true },
      { id: 'origami-paper-colour-assorted', type: 'colour', value: 'Assorted', hex: '#7a96b8', stock: 0, active: false },
      { id: 'origami-paper-colour-mono', type: 'colour', value: 'Monochrome', hex: '#16130f', stock: 0, active: false },
    ],
    tags: ['paper', 'supplies'],
    images: [],
    updatedAt: '2026-09-30T10:00:00Z',
  },
];

/** Unique categories, sorted — used by the product filter select. */
export const productCategories: string[] = Array.from(
  new Set(products.map((p) => p.category))
).sort();
