import type { Order } from '@/lib/types';

/**
 * Eight orders spanning every status. Nigerian names, Lagos addresses,
 * Paystack-style refs (placeholder), WhatsApp numbers, whole-naira totals.
 * One delivered order is dated today so the tracker's "delivered today"
 * counter has data. Totals are computed as subtotal − discount + fee.
 */
export const orders: Order[] = [
  {
    id: 'CH-1042',
    customerName: 'Adaeze Okonkwo',
    customerPhone: '+2348034127781',
    deliveryAddress: '14 Bode Thomas St, Surulere, Lagos',
    items: [
      { productName: 'Origami crane string, 20 pieces', variant: 'Waxed cotton', quantity: 1, unitPrice: 12000 },
      { productName: 'Origami gift box, set of 5', variant: 'Kraft', quantity: 2, unitPrice: 6500 },
    ],
    deliveryFee: 2500,
    status: 'pending',
    paymentRef: 'PAY_9f3k2mxa',
    paymentStatus: 'paid',
    paymentDate: '2026-10-22T08:12:00Z',
    createdAt: '2026-10-22T08:10:00Z',
    updatedAt: '2026-10-22T08:12:00Z',
  },
  {
    id: 'CH-1041',
    customerName: 'Tunde Bakare',
    customerPhone: '+2347055619934',
    deliveryAddress: '7 Awolowo Rd, Ikoyi, Lagos',
    items: [
      { productName: 'Party pack, 20 guests', variant: 'Kraft / 20 guests', quantity: 1, unitPrice: 18000 },
    ],
    deliveryFee: 3000,
    promoCode: 'EASTER15',
    discount: 2700,
    status: 'pending',
    paymentRef: 'PAY_7bb1q0ve',
    paymentStatus: 'paid',
    paymentDate: '2026-10-22T07:05:00Z',
    createdAt: '2026-10-22T07:01:00Z',
    updatedAt: '2026-10-22T07:05:00Z',
  },
  {
    id: 'CH-1040',
    customerName: 'Chiamaka Eze',
    customerPhone: '+2348123908456',
    deliveryAddress: '22 Ozumba Mbadiwe Ave, Victoria Island, Lagos',
    items: [
      { productName: 'Paper flower bouquet, 12 stems', variant: 'Moss / Grand', quantity: 1, unitPrice: 9500 },
      { productName: 'Paper plates, 9-inch (25 pack)', variant: 'Ribbed rim', quantity: 3, unitPrice: 4500 },
    ],
    deliveryFee: 2000,
    status: 'confirmed',
    paymentRef: 'PAY_2xd8c4lp',
    paymentStatus: 'paid',
    paymentDate: '2026-10-21T16:44:00Z',
    createdAt: '2026-10-21T16:40:00Z',
    updatedAt: '2026-10-22T06:30:00Z',
  },
  {
    id: 'CH-1039',
    customerName: 'Musa Danladi',
    customerPhone: '+2349067721180',
    deliveryAddress: '5 Ahmadu Bello Way, Kano',
    items: [
      { productName: 'Origami paper pack, 100 sheets', variant: '15 cm', quantity: 4, unitPrice: 3500 },
    ],
    deliveryFee: 4500,
    status: 'confirmed',
    paymentRef: 'PAY_5mn3rr7t',
    paymentStatus: 'paid',
    paymentDate: '2026-10-21T12:00:00Z',
    createdAt: '2026-10-21T11:55:00Z',
    updatedAt: '2026-10-21T14:20:00Z',
  },
  {
    id: 'CH-1038',
    customerName: 'Folake Adeyemi',
    customerPhone: '+2348033451102',
    deliveryAddress: '3 Bourdillon Rd, Ikoyi, Lagos',
    items: [
      { productName: 'Party pack, 20 guests', variant: 'Ivory / 50 guests', quantity: 2, unitPrice: 18000 },
      { productName: 'Origami gift box, set of 5', variant: 'Ink', quantity: 1, unitPrice: 6500 },
    ],
    deliveryFee: 2500,
    promoCode: 'FLAT2000',
    discount: 2000,
    status: 'in_transit',
    paymentRef: 'PAY_8kq4wz1d',
    paymentStatus: 'paid',
    paymentDate: '2026-10-20T09:30:00Z',
    createdAt: '2026-10-20T09:25:00Z',
    updatedAt: '2026-10-22T07:50:00Z',
  },
  {
    id: 'CH-1037',
    customerName: 'Emeka Nwosu',
    customerPhone: '+2347011284459',
    deliveryAddress: '11 Independence Layout, Enugu',
    items: [
      { productName: 'Paper flower bouquet, 12 stems', variant: 'Kraft & vermilion / Standard', quantity: 1, unitPrice: 9500 },
    ],
    deliveryFee: 3500,
    status: 'in_transit',
    paymentRef: 'PAY_1vv6ntqp',
    paymentStatus: 'paid',
    paymentDate: '2026-10-19T14:15:00Z',
    createdAt: '2026-10-19T14:10:00Z',
    updatedAt: '2026-10-21T18:00:00Z',
  },
  {
    id: 'CH-1036',
    customerName: 'Zainab Ibrahim',
    customerPhone: '+2348144097723',
    deliveryAddress: '40 Maitama District, Abuja',
    items: [
      { productName: 'Paper plates, 9-inch (25 pack)', variant: 'Matte bagasse / Natural', quantity: 6, unitPrice: 4500 },
      { productName: 'Origami crane string, 20 pieces', variant: 'Natural cotton', quantity: 1, unitPrice: 12000 },
    ],
    deliveryFee: 5000,
    status: 'delivered',
    paymentRef: 'PAY_3ha9jc6y',
    paymentStatus: 'paid',
    paymentDate: '2026-10-21T10:05:00Z',
    createdAt: '2026-10-21T10:00:00Z',
    updatedAt: '2026-10-22T09:45:00Z',
    notes: 'Left with the gatehouse. Customer confirmed on WhatsApp.',
  },
  {
    id: 'CH-1035',
    customerName: 'Kelechi Obi',
    customerPhone: '+2348077513398',
    deliveryAddress: '2 Ozumba Mbadiwe Ave, Lagos',
    items: [
      { productName: 'Origami gift box, set of 5', variant: 'Paper', quantity: 3, unitPrice: 6500 },
    ],
    deliveryFee: 2000,
    status: 'cancelled',
    paymentRef: 'PAY_6zs0pf8e',
    paymentStatus: 'failed',
    paymentDate: '2026-10-20T19:22:00Z',
    createdAt: '2026-10-20T19:20:00Z',
    updatedAt: '2026-10-21T08:15:00Z',
    notes: 'Payment failed on retry; customer asked us to cancel.',
  },
];

/** Sum of (line item subtotals). */
export function orderSubtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/** subtotal − discount + delivery fee. */
export function orderTotal(order: Order): number {
  return orderSubtotal(order) - (order.discount ?? 0) + order.deliveryFee;
}

/** Total item quantity across line items. */
export function orderItemCount(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}
