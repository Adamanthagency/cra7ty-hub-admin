import { format, parseISO } from 'date-fns';

/** Whole naira → ₦ with thousands separators. */
export function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

/** ISO date or datetime → "22 Oct 2026". */
export function formatShortDate(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy');
}

/** ISO datetime → "22 Oct 2026, 09:45". */
export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy, HH:mm');
}
