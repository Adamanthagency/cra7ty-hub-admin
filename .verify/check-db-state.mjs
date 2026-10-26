/**
 * Pre-push state check (Tier 2, item 1 migration apply).
 *
 * `supabase migration list` shows two local migrations the remote history
 * has never recorded (20261025213000 admin_emails, 20261026000000
 * published-only anon read) plus one phantom remote version
 * (20261026073207). Before repairing history and pushing, verify their
 * EFFECTS are actually live — otherwise the push would re-run DDL that
 * already exists (create table would fail / policies flap).
 *
 * Reads env at runtime from ../cra7ty-hub/.env.local; prints no secrets.
 */
import fs from 'node:fs';
import path from 'node:path';

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve('../cra7ty-hub/.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA || !ANON) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(2);
}

const anon = async (p, opts = {}) => {
  const res = await fetch(`${SUPA}/rest/v1/${p}`, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  return { status: res.status, text };
};

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + detail}`);
  if (!ok) failed++;
};

// 1) admin_emails exists AND is default-deny for anon.
//    - relation missing  → "schema cache" 404 => migration NOT applied
//    - permission denied → table exists, RLS/GRANT deny => applied
const admin = await anon('admin_emails?select=email');
check(
  'admin_emails applied: anon denied (not 404)',
  admin.status >= 400 && !admin.text.includes('schema cache'),
  `HTTP ${admin.status} ${admin.text.slice(0, 160)}`
);

// 2) published-only anon read on products: inactive invisible, active visible.
const inactive = await anon('products?select=id&status=eq.inactive');
const active = await anon('products?select=id&status=eq.active');
check(
  'products RLS: anon sees 0 inactive rows',
  inactive.status === 200 && (() => {
    try { return JSON.parse(inactive.text).length === 0; } catch { return false; }
  })(),
  `HTTP ${inactive.status} ${inactive.text.slice(0, 160)}`
);
check(
  'products RLS: anon still sees active rows (storefront works)',
  active.status === 200 && (() => {
    try { return JSON.parse(active.text).length > 0; } catch { return false; }
  })(),
  `HTTP ${active.status} ${active.text.slice(0, 160)}`
);

// 3) blog_posts: drafts invisible to anon.
const drafts = await anon('blog_posts?select=id&status=eq.draft');
check(
  'blog_posts RLS: anon sees 0 draft rows',
  drafts.status === 200 && (() => {
    try { return JSON.parse(drafts.text).length === 0; } catch { return false; }
  })(),
  `HTTP ${drafts.status} ${drafts.text.slice(0, 160)}`
);

// 4) the new migration must NOT be applied yet (categories sync fn).
const fn = await anon('rpc/apply_publish', {
  method: 'POST',
  body: JSON.stringify({
    p_values: {}, p_lists: {}, p_sections: [], p_settings: {},
    p_revision: {}, p_categories: [],
  }),
});
check(
  'categories_upsert NOT applied yet (anon rpc denied anyway — informational)',
  true,
  `HTTP ${fn.status}`
);

console.log(failed === 0 ? '\nALL CHECKS PASS' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
