import type { BlogPost } from '@/lib/types';

/**
 * Four posts — two published, two draft. Copy is in the storefront's
 * studio voice (see /data/posts.ts in the main repo). `placeholder: true`
 * drives the "Placeholder copy" chip convention until real copy lands.
 */
export const posts: BlogPost[] = [
  {
    id: 'counting-a-two-hundred-guest-order',
    title: 'Counting a two-hundred guest order',
    slug: 'counting-a-two-hundred-guest-order',
    excerpt:
      'Two hundred of five things, banded into sleeves with the number written on the outside. Why a party pack takes days rather than hours.',
    content: [
      'A party pack is not a pile. Each guest gets one 9-inch plate, one side plate, one spoon, one cup and two napkins, and at two hundred guests that is a thousand separate pieces of paper before a single one of them is folded.',
      '',
      '## Counting is the job',
      '',
      'The pieces are counted into sleeves in fives and tens, then banded, then counted again against the guest number written on the outside of the sleeve.',
      '',
      '> The folding is fast. Making sure the two hundredth cup is in the two hundredth sleeve is the part that cannot be rushed.',
      '',
      'Counting is why a two-hundred guest order needs five to seven working days rather than one.',
    ].join('\n'),
    category: 'Studio practice',
    tags: ['party packs', 'process'],
    status: 'published',
    placeholder: true,
    coverUrl: null,
    publishedAt: '2026-10-06',
    updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'why-bagasse-plates-hold-hot-food',
    title: 'Why bagasse plates hold hot food',
    slug: 'why-bagasse-plates-hold-hot-food',
    excerpt:
      'Sugarcane waste, pressed under heat, and a rim that is rolled rather than cut. What that means at a table of hot food.',
    content: [
      'Bagasse is what is left after sugarcane is crushed for its juice. Pressed under heat it becomes a rigid sheet, and that is what our plates are stamped from — not coated paper, not plastic-lined board.',
      '',
      '## The rim is the difference',
      '',
      'A cut rim is a fold waiting for a full plate of jollof; a rolled rim carries the weight around the edge.',
      '',
      'Both sizes come out in the same kraft tone, so a table that runs out of 9-inches mid-service can borrow the side plates and nobody notices the swap.',
    ].join('\n'),
    category: 'Materials',
    tags: ['bagasse', 'table'],
    status: 'published',
    placeholder: false,
    coverUrl: null,
    publishedAt: '2026-09-22',
    updatedAt: '2026-09-22T09:00:00Z',
  },
  {
    id: 'the-crane-neck-problem',
    title: 'The crane neck problem',
    slug: 'the-crane-neck-problem',
    excerpt:
      'Why every crane ships in its own kraft pocket, and what happens when one arrives folded too tight.',
    content: [
      'A crane folded from damp paper slumps. A crane folded too tight gets a crease across the neck that no amount of steaming will lift.',
      '',
      '### What we do about it',
      '',
      'Every crane ships in its own kraft pocket so it does not arrive with a broken neck. The wings are set with a trace of starch so the bird holds its shape on a shelf.',
    ].join('\n'),
    category: 'Studio practice',
    tags: ['origami', 'shipping'],
    status: 'draft',
    placeholder: true,
    coverUrl: null,
    publishedAt: null,
    updatedAt: '2026-10-20T17:30:00Z',
  },
  {
    id: 'five-ways-to-band-a-gift-stack',
    title: 'Five ways to band a gift stack',
    slug: 'five-ways-to-band-a-gift-stack',
    excerpt:
      'Twine, paper bands, a wax seal, and two knots that hold without glue. Notes from the wrapping table.',
    content: [
      'Banding is what keeps a stack of five boxes a stack rather than five boxes.',
      '',
      '## One: the double overhand',
      '',
      'It carries the weight of its own bundle and never needs glue to hold.',
    ].join('\n'),
    category: 'Wrapping',
    tags: ['gift-wrap', 'tutorial'],
    status: 'draft',
    placeholder: false,
    coverUrl: null,
    publishedAt: null,
    updatedAt: '2026-10-21T12:10:00Z',
  },
];
