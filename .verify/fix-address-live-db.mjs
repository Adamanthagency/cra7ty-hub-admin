// One-off: correct the studio address at its LIVE source (site_settings,
// content_values, content_list_items) after the Victory Estate correction.
// Same replacement rules as the code-seed fix in src/data.
import { readFileSync } from 'node:fs';

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
  Prefer: 'return=representation',
};
const U = env.NEXT_PUBLIC_SUPABASE_URL;

const rules = [
  ['No. 14, Glover Road, Surulere, Lagos', 'Victory Estate, Ago Palace Way, Okota, Lagos'],
  ['The room on Glover Road', 'The room on Ago Palace Way'],
  ['Glover Road in Surulere', 'Ago Palace Way in Okota'],
  ['studio in Surulere', 'studio in Okota'],
  ['in Surulere', 'in Okota'],
  ['Surulere room', 'Okota room'],
  ['Surulere / Est', 'Okota / Est'],
];

const fix = (v) => {
  if (typeof v === 'string') {
    let out = v;
    for (const [a, b] of rules) out = out.split(a).join(b);
    return out;
  }
  if (Array.isArray(v)) return v.map(fix);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, fix(val)]));
  }
  return v;
};

let writes = 0;
const patch = async (table, filter, body, label) => {
  const r = await fetch(`${U}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify(body),
  });
  console.log(`WRITE ${label} — HTTP ${r.status}`);
  if (r.ok) writes++;
};

/* 1 — site_settings: address + any seo.* with the old strings */
const ss = await fetch(`${U}/rest/v1/site_settings?select=key,value`, { headers: H }).then((r) => r.json());
for (const row of ss) {
  const nv = fix(row.value);
  if (JSON.stringify(nv) !== JSON.stringify(row.value)) {
    await patch('site_settings', `key=eq.${encodeURIComponent(row.key)}`, { value: nv }, `site_settings.${row.key}`);
  }
}

/* 2 — content_values (about hero, faq cards, …) */
const cv = await fetch(`${U}/rest/v1/content_values?select=key,value`, { headers: H }).then((r) => r.json());
for (const row of cv) {
  const nv = fix(row.value);
  if (JSON.stringify(nv) !== JSON.stringify(row.value)) {
    await patch('content_values', `key=eq.${encodeURIComponent(row.key)}`, { value: nv }, `content_values.${row.key}`);
  }
}

/* 3 — content_list_items (process steps, about sheet stations) */
const li = await fetch(`${U}/rest/v1/content_list_items?select=list_key,item_id,fields`, { headers: H }).then((r) => r.json());
for (const row of li) {
  const nf = fix(row.fields);
  if (JSON.stringify(nf) !== JSON.stringify(row.fields)) {
    await patch(
      'content_list_items',
      `list_key=eq.${encodeURIComponent(row.list_key)}&item_id=eq.${encodeURIComponent(row.item_id)}`,
      { fields: nf },
      `content_list_items.${row.list_key}#${row.item_id}`,
    );
  }
}

console.log('total writes:', writes);

/* verify nothing old remains */
let left = 0;
for (const t of ['site_settings', 'content_values', 'content_list_items']) {
  const j = await fetch(`${U}/rest/v1/${t}?select=*`, { headers: H }).then((r) => r.json());
  const hits = j.filter((x) => /Glover|Surulere/i.test(JSON.stringify(x)));
  left += hits.length;
  for (const h of hits) console.log('LEFTOVER in', t, JSON.stringify(h).slice(0, 200));
}
console.log('remaining Glover/Surulere rows in DB:', left);
