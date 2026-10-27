'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { FieldInput } from '@/components/admin/workbench/field-input';
import { useContent } from '@/components/admin/workbench/content-provider';
import {
  validateWhatsAppNumber,
  validateWholeNaira,
  waMeUrl,
} from '@/lib/content-validation';
import type { PageKey, SiteSettings } from '@/lib/types';

/** mono section label used across the settings groups */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-b border-line pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-60">
      {children}
    </h2>
  );
}

const SEO_PAGES: { key: PageKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'shop', label: 'Shop' },
  { key: 'blog', label: 'Blog' },
  { key: 'about', label: 'About' },
  { key: 'product', label: 'Product page (fallback)' },
  { key: 'tracker', label: 'My Order' },
];

export default function SettingsPage() {
  const { settings, addDraft } = useContent();

  // local working copy seeded from live settings
  const [form, setForm] = useState<SiteSettings>(() => JSON.parse(JSON.stringify(settings)));
  const [note, setNote] = useState<string | null>(null);

  const patch = (partial: Partial<SiteSettings>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const patchSeo = (page: PageKey, partial: Partial<SiteSettings['seo'][typeof page]>) =>
    setForm((prev) => ({
      ...prev,
      seo: { ...prev.seo, [page]: { title: '', description: '', ...prev.seo[page], ...partial } },
    }));

  const waError = validateWhatsAppNumber(form.whatsappNumber);
  const thresholdRaw = String(form.freeDeliveryOver);
  const thresholdError = validateWholeNaira(thresholdRaw);

  const canSave = !waError && !thresholdError;

  const save = () => {
    if (!canSave) return;
    // one settings draft per changed top-level path, so the diff reads clearly
    const entries: { path: string; label: string; before: unknown; after: unknown }[] = [];
    const scalarKeys: (keyof SiteSettings)[] = [
      'siteName',
      'tagline',
      'whatsappNumber',
      'whatsappDisplay',
      'email',
      'address',
      'instagram',
    ];
    for (const k of scalarKeys) {
      if (form[k] !== settings[k]) {
        entries.push({
          path: `settings.${k}`,
          label: `Settings — ${k}`,
          before: settings[k],
          after: form[k],
        });
      }
    }
    if (form.freeDeliveryOver !== settings.freeDeliveryOver) {
      entries.push({
        path: 'settings.freeDeliveryOver',
        label: 'Settings — free delivery threshold',
        before: settings.freeDeliveryOver,
        after: form.freeDeliveryOver,
      });
    }
    for (const { key, label } of SEO_PAGES) {
      const before = settings.seo[key] ?? { title: '', description: '' };
      const after = form.seo[key] ?? { title: '', description: '' };
      if (before.title !== after.title) {
        entries.push({
          path: `settings.seo.${key}.title`,
          label: `SEO — ${label} title`,
          before: before.title,
          after: after.title,
        });
      }
      if (before.description !== after.description) {
        entries.push({
          path: `settings.seo.${key}.description`,
          label: `SEO — ${label} description`,
          before: before.description,
          after: after.description,
        });
      }
    }

    if (entries.length === 0) {
      setNote('Nothing changed.');
      return;
    }
    for (const e of entries) {
      addDraft({
        type: 'settings',
        key: e.path,
        label: e.label,
        before: e.before,
        after: e.after,
      });
    }
    setNote(
      `${entries.length} change${entries.length === 1 ? '' : 's'} saved to drafts — publish from the bar above.`
    );
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Site-wide copy and contact"
        right={
          <span className="font-mono text-[11px] text-paper-40">
            Applies to every page
          </span>
        }
      />

      <div className="space-y-6">
        {/* ---------- Contact ---------- */}
        <section className="card-admin space-y-4 p-5">
          <GroupLabel>Contact</GroupLabel>

          <div>
            <FieldInput
              label="WhatsApp number (international digits)"
              type="text"
              value={form.whatsappNumber}
              onChange={(v) => patch({ whatsappNumber: v })}
            />
            {waError ? (
              <p role="alert" className="mt-1 font-mono text-[11px] text-vermilion">
                {waError}
              </p>
            ) : (
              <a
                href={waMeUrl(form.whatsappNumber)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-moss-bright hover:text-paper"
              >
                <ExternalLink size={11} aria-hidden />
                Test link (opens wa.me)
              </a>
            )}
          </div>

          <FieldInput
            label="Display number"
            type="text"
            value={form.whatsappDisplay}
            onChange={(v) => patch({ whatsappDisplay: v })}
          />

          <FieldInput
            label="Contact email"
            type="text"
            value={form.email}
            onChange={(v) => patch({ email: v })}
          />

          <FieldInput
            label="Studio address"
            type="longtext"
            value={form.address}
            onChange={(v) => patch({ address: v })}
            maxLength={160}
          />
        </section>

        {/* ---------- Social ---------- */}
        <section className="card-admin space-y-4 p-5">
          <GroupLabel>Social</GroupLabel>
          <FieldInput
            label="Instagram handle"
            type="text"
            value={form.instagram}
            onChange={(v) => patch({ instagram: v.replace(/^@/, '') })}
            maxLength={32}
          />
        </section>

        {/* ---------- Commerce ---------- */}
        <section className="card-admin space-y-4 p-5">
          <GroupLabel>Commerce</GroupLabel>
          <div>
            <FieldInput
              label="Free delivery threshold (whole naira)"
              type="text"
              value={thresholdRaw}
              onChange={(v) => patch({ freeDeliveryOver: Number(v.replace(/[^0-9]/g, '') || 0) })}
            />
            {thresholdError && (
              <p role="alert" className="mt-1 font-mono text-[11px] text-vermilion">
                {thresholdError}
              </p>
            )}
          </div>
        </section>

        {/* ---------- Identity ---------- */}
        <section className="card-admin space-y-4 p-5">
          <GroupLabel>Identity</GroupLabel>
          <FieldInput
            label="Site name"
            type="text"
            value={form.siteName}
            onChange={(v) => patch({ siteName: v })}
            maxLength={40}
          />
          <FieldInput
            label="Tagline"
            type="text"
            value={form.tagline}
            onChange={(v) => patch({ tagline: v })}
            maxLength={80}
          />
        </section>

        {/* ---------- SEO ---------- */}
        <section className="card-admin space-y-5 p-5">
          <GroupLabel>SEO per page</GroupLabel>
          {SEO_PAGES.map(({ key, label }) => {
            const entry = form.seo[key] ?? { title: '', description: '' };
            const placeholder = settings.seo[key]?.placeholder === true;
            return (
              <div key={key} className="space-y-3 border-b border-line/60 pb-4 last:border-0 last:pb-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-paper">{label}</span>
                  {placeholder && (
                    <span className="rounded-card border border-kraft-30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-kraft-60">
                      Placeholder
                    </span>
                  )}
                </div>
                <FieldInput
                  label="Meta title"
                  type="text"
                  value={entry.title}
                  onChange={(v) => patchSeo(key, { title: v })}
                  maxLength={70}
                  required={false}
                />
                <FieldInput
                  label="Meta description"
                  type="longtext"
                  value={entry.description}
                  onChange={(v) => patchSeo(key, { description: v })}
                  maxLength={160}
                  required={false}
                  tokens={key === 'shop' ? ['total'] : undefined}
                />
              </div>
            );
          })}
        </section>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <button type="button" onClick={save} disabled={!canSave} className="btn-vermilion">
            Save to drafts
          </button>
          {note && (
            <p role="status" className="font-mono text-[11px] leading-snug text-moss-bright">
              {note}
            </p>
          )}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-40">
          Payments, shipping and tax settings land with the backend
        </p>
      </div>
    </div>
  );
}
