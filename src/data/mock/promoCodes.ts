import type { PromoCode } from '@/lib/types';

/**
 * Three promo codes: one active percentage code, one active flat code,
 * one expired percentage code.
 */
export const promoCodes: PromoCode[] = [
  {
    id: 'pc-easter15',
    code: 'EASTER15',
    type: 'percentage',
    value: 15,
    usageCount: 12,
    usageLimit: 50,
    expiresAt: '2026-12-31',
    minOrderAmount: 10000,
    active: true,
  },
  {
    id: 'pc-flat2000',
    code: 'FLAT2000',
    type: 'flat',
    value: 2000,
    usageCount: 4,
    usageLimit: 25,
    expiresAt: '2027-03-31',
    minOrderAmount: 15000,
    active: true,
  },
  {
    id: 'pc-july10',
    code: 'JULY10',
    type: 'percentage',
    value: 10,
    usageCount: 37,
    usageLimit: 40,
    expiresAt: '2026-07-31',
    active: false,
  },
];
