import type { Category } from '@/lib/types';

/**
 * The six storefront categories, ids fixed (they are the query values in
 * /shop?category=…). Name and blurb are seeded from src/data/products.ts;
 * index is the editorial number the Categories section prints — it
 * renumbers automatically when the admin reorders.
 */
export const categories: Category[] = [
  {
    id: 'origami',
    index: '01',
    name: 'Origami & sculpture',
    blurb: 'Cranes, flowers, animals and wall pieces. Folded one at a time, in the studio, by hand.',
  },
  {
    id: 'table',
    index: '02',
    name: 'Paper table',
    blurb: 'Plates, spoons and cups pressed from bagasse and kraft. Sizes that fit a real table.',
  },
  {
    id: 'party',
    index: '03',
    name: 'Party packs',
    blurb: 'Counted, banded and ready for twenty to two hundred guests. Nothing left to guess.',
  },
  {
    id: 'gift',
    index: '04',
    name: 'Gift & wrap',
    blurb: 'Boxes that close with two folds, plus wrap sheets printed with a grid on the back.',
  },
  {
    id: 'bulk',
    index: '05',
    name: 'Bulk & events',
    blurb: 'Weddings, naming ceremonies, school events and the small businesses that buy monthly.',
  },
  {
    id: 'paper',
    index: '06',
    name: 'Origami paper',
    blurb: 'Loose sheets in eleven colours, 80 gsm, shuffled by hand before they are bagged.',
  },
];
