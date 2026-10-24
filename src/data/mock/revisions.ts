import type { Revision } from '@/lib/types';

/**
 * Two prior revisions so /admin/history has real history to show on
 * first load. Values mirror strings that exist in the seed content —
 * the diff table only ever shows field labels and old/new values.
 */
export const revisions: Revision[] = [
  {
    id: 'rev-0002',
    at: '2026-10-20T14:05:00Z',
    author: 'Studio',
    changes: [
      {
        key: 'home.hero.subline',
        label: 'Hero — subline',
        from: 'Origami cranes, pressed paper plates, party packs and gift wrap. Sent to you on WhatsApp.',
        to: 'Origami cranes, pressed paper plates, party packs and gift wrap. Counted, stacked and wrapped to order — then sent to you on WhatsApp.',
      },
      {
        key: 'home.faq.items:faq-4:answer',
        label: 'FAQ — What does bulk pricing look like? (answer)',
        from: 'Five per cent off from 50 units, ten from 100, fifteen from 250, and a quoted rate from 500.',
        to: 'Five per cent off from 50 units, ten from 100, fifteen from 250, and a quoted rate from 500. The discount applies to the order total rather than to each line, so mixing lines still counts. Lagos delivery is free over fifty thousand naira.',
      },
    ],
  },
  {
    id: 'rev-0001',
    at: '2026-10-14T11:42:00Z',
    author: 'Studio',
    changes: [
      {
        key: 'settings.freeDeliveryOver',
        label: 'Settings — free delivery threshold',
        from: '₦30,000',
        to: '₦50,000',
      },
      {
        key: 'global.footer.small-print',
        label: 'Footer — small print',
        from: 'Cra7ty Hub is a Lagos paper studio. Prices in naira.',
        to: 'Cra7ty Hub is a Lagos paper studio. Prices in naira, inclusive of folding. Nothing is charged from this website — orders are confirmed on WhatsApp.',
      },
      {
        key: 'home.process.steps:process-2:title',
        label: 'Process — step 2 title',
        from: 'We fold it in Lagos',
        to: 'We fold it in Surulere',
      },
    ],
  },
];
