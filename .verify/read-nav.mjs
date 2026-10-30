// READ-ONLY: prints the live nav + footer link lists. No writes.
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
};
const U = env.NEXT_PUBLIC_SUPABASE_URL;

const get = async (path) => {
  const r = await fetch(`${U}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
};

for (const key of [
  'global.navigation.links',
  'global.footer.orders-links',
  'global.footer.studio-links',
  'global.footer.shop-links',
]) {
  const rows = await get(
    `content_list_items?list_key=eq.${key}&select=item_id,position,fields&order=position`,
  );
  console.log(`\n### ${key}`);
  for (const r of rows) console.log(`  ${r.position}\t${r.item_id}\t${JSON.stringify(r.fields)}`);
}

// scalar nav field (the "Order" button label)
const fields = await get(
  `content_fields?key=in.("global.navigation.order-label")&select=key,value`,
).catch(() => null);
console.log('\n### order-label row:', JSON.stringify(fields));
