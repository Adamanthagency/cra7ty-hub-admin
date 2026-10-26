'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Copy, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { SidePanel } from '@/components/admin/side-panel';
import { StatusChip } from '@/components/admin/status-chip';
import { promoCodes as seed } from '@/data/mock/promoCodes';
import {
  deletePromoCode,
  fetchPromoCodes,
  savePromoCode,
} from '@/lib/orders-api';
import type { DiscountType, PromoCode } from '@/lib/types';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const ADJECTIVES = ['PAPER', 'KRAFT', 'FOLD', 'CRANE', 'VERMILION', 'MOSS'];
const NOUNS = ['STUDIO', 'TABLE', 'PARTY', 'GIFT', 'WRAP', 'LAGOS'];

function generateCode(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const d = Math.floor(Math.random() * 90) + 10;
  return `${a}${n}${d}`;
}

function deriveStatus(code: PromoCode): 'active' | 'expired' | 'inactive' {
  if (!code.active) return 'inactive';
  const today = new Date().toISOString().slice(0, 10);
  // an empty expiry means "never expires"
  if (code.expiresAt && code.expiresAt < today) return 'expired';
  return 'active';
}

interface DraftState {
  /** set when editing — the save then PATCHes this row instead of
   *  creating a duplicate */
  id?: string;
  code: string;
  type: DiscountType;
  value: string;
  usageLimit: string;
  expiresAt: string;
  minOrderAmount: string;
  active: boolean;
}

const emptyDraft: DraftState = {
  code: '',
  type: 'percentage',
  value: '',
  usageLimit: '',
  expiresAt: '',
  minOrderAmount: '',
  active: true,
};

export default function PromoCodesPage() {
  // Seed paints instantly; the coupon_codes table is the source of truth
  // (usage counts there are owned by the payment flow, never the client).
  const [codes, setCodes] = useState<PromoCode[]>(seed);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    fetchPromoCodes()
      .then(setCodes)
      .catch(() => {
        // offline — the last painted list stays
      });
  };
  useEffect(refresh, []);

  const activeCount = codes.filter((c) => deriveStatus(c) === 'active').length;

  const patch = (partial: Partial<DraftState>) =>
    setDraft((prev) => ({ ...prev, ...partial }));

  const save = async () => {
    const code = draft.code.trim().toUpperCase();
    const value = Number(draft.value);
    if (!code) return setError('Code is required.');
    if (!draft.value || Number.isNaN(value) || value <= 0)
      return setError('Enter a discount value.');
    if (draft.type === 'percentage' && value > 100)
      return setError('Percentage cannot exceed 100.');
    if (
      !draft.id &&
      codes.some((c) => c.code === code)
    )
      return setError('That code already exists.');

    setSaving(true);
    setError(null);
    try {
      await savePromoCode({
        // coupon_codes.id is a uuid column — new codes get a plain UUID
        id: draft.id ?? crypto.randomUUID(),
        code,
        type: draft.type,
        value,
        usageCount: 0,
        usageLimit: draft.usageLimit ? Number(draft.usageLimit) : undefined,
        expiresAt: draft.expiresAt,
        minOrderAmount: draft.minOrderAmount ? Number(draft.minOrderAmount) : undefined,
        active: draft.active,
      });
      refresh(); // the server's row (real id, real usage count) wins
      setDraft(emptyDraft);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (code: PromoCode) => {
    if (!window.confirm(`Delete ${code.code}? This cannot be undone.`)) return;
    try {
      await deletePromoCode(code.id);
      refresh();
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Promo codes"
        subtitle={`${activeCount} active`}
        right={
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft);
              setError(null);
              setOpen(true);
            }}
            className="btn-vermilion"
          >
            <Plus size={15} aria-hidden />
            New code
          </button>
        }
      />

      <div className="card-admin overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
                <th scope="col" className="px-4 py-2.5 font-normal">Code</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Discount</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Type</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Usage</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Expiry</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const status = deriveStatus(c);
                return (
                  <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-paper-12">
                    <td className="px-4 py-3 font-mono text-xs font-bold tracking-wide text-paper">
                      {c.code}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper">
                      {c.type === 'percentage' ? `${c.value}%` : `₦${c.value.toLocaleString('en-NG')}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-card border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-paper-60">
                        {c.type === 'percentage' ? '%' : 'flat'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-paper-70">
                      {c.usageCount}
                      {c.usageLimit !== undefined ? ` / ${c.usageLimit}` : ''}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-paper-60">
                      {c.expiresAt ? formatShortDate(c.expiresAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Copy ${c.code}`}
                          onClick={() => navigator.clipboard?.writeText(c.code)}
                          className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${c.code}`}
                          onClick={() => {
                            setDraft({
                              id: c.id,
                              code: c.code,
                              type: c.type,
                              value: String(c.value),
                              usageLimit: c.usageLimit !== undefined ? String(c.usageLimit) : '',
                              expiresAt: c.expiresAt,
                              minOrderAmount:
                                c.minOrderAmount !== undefined ? String(c.minOrderAmount) : '',
                              active: c.active,
                            });
                            setError(null);
                            setOpen(true);
                          }}
                          className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-paper"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${c.code}`}
                          onClick={() => void remove(c)}
                          className="rounded-card p-2 text-paper-60 hover:bg-paper-12 hover:text-vermilion"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New code slide-over */}
      <SidePanel
        open={open}
        onOpenChange={setOpen}
        title={draft.id ? 'Edit promo code' : 'New promo code'}
        description="Codes are validated by shoppers' checkouts server-side — usage counts update as payments land."
      >
        <div className="space-y-5">
          {/* Code + generate */}
          <div>
            <label
              htmlFor="promo-code"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Code
            </label>
            <div className="flex gap-2">
              <input
                id="promo-code"
                value={draft.code}
                onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
                placeholder="EASTER15"
                className="input-hairline flex-1 font-mono uppercase"
              />
              <button
                type="button"
                onClick={() => patch({ code: generateCode() })}
                className="btn-ghost-dark shrink-0"
              >
                Generate
              </button>
            </div>
          </div>

          {/* Discount type toggle */}
          <div>
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Discount type
            </span>
            <div role="group" aria-label="Discount type" className="inline-flex rounded-card border border-line p-0.5">
              {(
                [
                  { key: 'percentage', label: 'Percentage' },
                  { key: 'flat', label: 'Flat amount' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => patch({ type: opt.key })}
                  aria-pressed={draft.type === opt.key}
                  className={cn(
                    'rounded-[3px] px-3 py-1.5 font-mono text-[11px] transition-colors',
                    draft.type === opt.key
                      ? 'bg-paper-12 text-paper'
                      : 'text-paper-60 hover:text-paper'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Value — label switches with type */}
          <div>
            <label
              htmlFor="promo-value"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              {draft.type === 'percentage' ? 'Discount (%)' : 'Discount (₦)'}
            </label>
            <input
              id="promo-value"
              type="number"
              min={1}
              max={draft.type === 'percentage' ? 100 : undefined}
              value={draft.value}
              onChange={(e) => patch({ value: e.target.value })}
              placeholder={draft.type === 'percentage' ? '15' : '2000'}
              className="input-hairline font-mono"
            />
          </div>

          {/* Usage limit */}
          <div>
            <label
              htmlFor="promo-limit"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Usage limit (optional)
            </label>
            <input
              id="promo-limit"
              type="number"
              min={1}
              value={draft.usageLimit}
              onChange={(e) => patch({ usageLimit: e.target.value })}
              placeholder="No limit"
              className="input-hairline font-mono"
            />
          </div>

          {/* Expiry */}
          <div>
            <label
              htmlFor="promo-expiry"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Expiry date (optional — empty means never expires)
            </label>
            <input
              id="promo-expiry"
              type="date"
              value={draft.expiresAt}
              onChange={(e) => patch({ expiresAt: e.target.value })}
              className="input-hairline font-mono [&::-webkit-calendar-picker-indicator]:invert"
            />
          </div>

          {/* Min order */}
          <div>
            <label
              htmlFor="promo-min"
              className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60"
            >
              Minimum order amount (optional, ₦)
            </label>
            <input
              id="promo-min"
              type="number"
              min={0}
              value={draft.minOrderAmount}
              onChange={(e) => patch({ minOrderAmount: e.target.value })}
              placeholder="No minimum"
              className="input-hairline font-mono"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
              Active
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.active}
              aria-label="Code active"
              onClick={() => patch({ active: !draft.active })}
              className={cn(
                'inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors',
                draft.active ? 'border-vermilion bg-vermilion-20' : 'border-line bg-bg'
              )}
            >
              <span
                className={cn(
                  'h-3.5 w-3.5 rounded-full transition-transform',
                  draft.active ? 'translate-x-4 bg-vermilion' : 'translate-x-0 bg-paper-40'
                )}
              />
            </button>
          </div>

          {error && (
            <p role="alert" className="font-mono text-xs text-vermilion">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-vermilion w-full disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save code'}
          </button>
        </div>
      </SidePanel>
    </div>
  );
}
