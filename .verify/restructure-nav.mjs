// Restructure the live nav / Order submenu / footer studio links.
//
//   node .verify/restructure-nav.mjs           # print BEFORE + plan, write nothing
//   node .verify/restructure-nav.mjs --apply   # perform the writes, then print AFTER
//
// Reads .env.local itself; never prints secrets. Every write is logged.
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const U = env.NEXT_PUBLIC_SUPABASE_URL;

const rows = async (key) => {
  const r = await fetch(
    `${U}/rest/v1/content_list_items?list_key=eq.${key}&select=item_id,position,fields&order=position`,
    { headers: H },
  );
  if (!r.ok) throw new Error(`${key} read -> ${r.status} ${await r.text()}`);
  return r.json();
};

const write = async (label, fn) => {
  const res = await fn();
  const text = await res.text();
  console.log(`  WRITE ${label} -> ${res.status}${text ? ` ${text}` : ''}`);
  if (res.status >= 300) throw new Error(`write failed: ${label}`);
};

/* ------------------------------------------------------------------ */
/* The target state                                                     */
/* ------------------------------------------------------------------ */

const NAV = 'global.navigation.links';
const ORDER = 'global.navigation.order-links';
const STUDIO = 'global.footer.studio-links';

const navTarget = [
  ['nav-home', 'Home', '/'],
  ['nav-shop', 'Shop', '/shop'],
  ['nav-order', 'Order', '/tracker'],
  ['nav-events', 'Events', '/events'],
  ['nav-workshops', 'Workshops', '/workshops'],
  ['nav-courses', 'Courses', '/courses'],
  ['nav-blog', 'Blog', '/blog'],
  ['nav-about', 'About', '/about'],
];

const orderTarget = [
  ['nav-order-mine', 'My Order', '/tracker'],
  ['nav-order-bulk', 'Bulk Order', '/#bulk'],
];

const studioTarget = [
  ['f-studio-1', 'About the folds', '/#process'],
  ['f-studio-2', 'Why paper', '/#why'],
  ['f-studio-3', 'Custom work', '/#bulk'],
  ['f-studio-4', 'Blog', '/blog'],
  ['f-studio-6', 'Workshops', '/workshops'],
  ['f-studio-7', 'Events', '/events'],
  ['f-studio-8', 'Courses', '/courses'],
  ['f-studio-5', 'Contact', '/#footer-contact'],
];

const show = (name, list) => {
  console.log(`\n### ${name}`);
  if (!list.length) console.log('  (empty)');
  for (const r of list) {
    console.log(`  ${r.position}\t${r.item_id}\t${JSON.stringify(r.fields)}`);
  }
};

const before = {
  [NAV]: await rows(NAV),
  [ORDER]: await rows(ORDER).catch(() => []),
  [STUDIO]: await rows(STUDIO),
};

show(`${NAV} — BEFORE`, before[NAV]);
show(`${ORDER} — BEFORE`, before[ORDER]);
show(`${STUDIO} — BEFORE`, before[STUDIO]);

/* ------------------------------------------------------------------ */
/* Plan                                                                 */
/* ------------------------------------------------------------------ */

const plan = (key, target) => {
  const have = new Map(before[key].map((r) => [r.item_id, r]));
  const want = new Set(target.map(([id]) => id));
  const adds = target.filter(([id]) => !have.has(id));
  const drops = before[key].filter((r) => !want.has(r.item_id));
  const sets = target.filter(
    ([id, label, href]) =>
      have.has(id) &&
      (have.get(id).position !== target.findIndex((t) => t[0] === id) ||
        have.get(id).fields?.label !== label ||
        have.get(id).fields?.href !== href),
  );
  return { adds, drops, sets };
};

const planFor = {
  [NAV]: plan(NAV, navTarget),
  [ORDER]: plan(ORDER, orderTarget),
  [STUDIO]: plan(STUDIO, studioTarget),
};

console.log('\n### PLAN');
for (const [key, p] of Object.entries(planFor)) {
  console.log(`  ${key}`);
  console.log(`    add    ${p.adds.map((a) => a[0]).join(', ') || '—'}`);
  console.log(`    drop   ${p.drops.map((d) => d.item_id).join(', ') || '—'}`);
  console.log(`    set    ${p.sets.map((s) => s[0]).join(', ') || '—'}`);
}

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply.');
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Apply: add at a temp position, drop the old rows, then set finals.   */
/* Never leaves a list empty, and temp positions cannot collide.        */
/* ------------------------------------------------------------------ */

console.log('\n### APPLYING');

for (const [key, target] of [
  [NAV, navTarget],
  [ORDER, orderTarget],
  [STUDIO, studioTarget],
]) {
  const p = planFor[key];

  // 1. add new rows well clear of the live positions
  for (let i = 0; i < p.adds.length; i += 1) {
    const [id, label, href] = p.adds[i];
    await write(`${key} insert ${id}`, () =>
      fetch(`${U}/rest/v1/content_list_items`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          list_key: key,
          item_id: id,
          position: 500 + i,
          fields: { label, href },
        }),
      }),
    );
  }

  // 2. drop rows that are no longer part of the nav
  for (const d of p.drops) {
    await write(`${key} delete ${d.item_id}`, () =>
      fetch(
        `${U}/rest/v1/content_list_items?list_key=eq.${key}&item_id=eq.${d.item_id}`,
        { method: 'DELETE', headers: H },
      ),
    );
  }

  // 3. park every row at a temp position so final positions cannot
  //    collide with a row that has not been moved yet
  for (let i = 0; i < target.length; i += 1) {
    const [id] = target[i];
    await write(`${key} park ${id}`, () =>
      fetch(
        `${U}/rest/v1/content_list_items?list_key=eq.${key}&item_id=eq.${id}`,
        { method: 'PATCH', headers: H, body: JSON.stringify({ position: 900 + i }) },
      ),
    );
  }

  // 4. final position + fields for every row
  for (let i = 0; i < target.length; i += 1) {
    const [id, label, href] = target[i];
    await write(`${key} set ${id} @${i}`, () =>
      fetch(
        `${U}/rest/v1/content_list_items?list_key=eq.${key}&item_id=eq.${id}`,
        {
          method: 'PATCH',
          headers: H,
          body: JSON.stringify({ position: i, fields: { label, href } }),
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* After                                                                */
/* ------------------------------------------------------------------ */

for (const key of [NAV, ORDER, STUDIO]) show(`${key} — AFTER`, await rows(key));

console.log('\nDone.');
