// Idempotent: adds the Workshops links to the live nav + footer lists.
// Safe to re-run — checks existence first, positions are absolute.
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
};
const U = env.NEXT_PUBLIC_SUPABASE_URL;

async function call(fn, tries = 5) {
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const list = async (key) =>
  call(() =>
    fetch(`${U}/rest/v1/content_list_items?list_key=eq.${key}&select=item_id,position&order=position`, { headers: H })
      .then((r) => r.json()),
  );

const move = (key, item, pos) =>
  call(() =>
    fetch(`${U}/rest/v1/content_list_items?list_key=eq.${key}&item_id=eq.${item}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ position: pos }),
    }).then((r) => r.status),
  );

const insert = (key, item, pos, fields) =>
  call(() =>
    fetch(`${U}/rest/v1/content_list_items`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ list_key: key, item_id: item, position: pos, fields }),
    }).then((r) => r.status),
  );

/* ---- nav: Workshops at position 4, Blog/About/Tracker shift down ---- */
const nav = await list('global.navigation.links');
if (!nav.some((x) => x.item_id === 'nav-workshops')) {
  for (const [item, pos] of [['nav-tracker', 7], ['nav-about', 6], ['nav-blog', 5]]) {
    const row = nav.find((x) => x.item_id === item);
    if (row && row.position !== pos) {
      console.log('WRITE move', item, '->', pos, await move('global.navigation.links', item, pos));
    }
  }
  console.log('WRITE insert nav-workshops @4',
    await insert('global.navigation.links', 'nav-workshops', 4, { label: 'Workshops', href: '/workshops' }));
} else {
  console.log('nav-workshops already present');
}

/* ---- footer studio column: Workshops before Contact ---- */
const studio = await list('global.footer.studio-links');
if (!studio.some((x) => x.item_id === 'f-studio-6')) {
  const contact = studio.find((x) => x.item_id === 'f-studio-5');
  if (contact && contact.position !== 5) {
    console.log('WRITE move f-studio-5 ->', 5, await move('global.footer.studio-links', 'f-studio-5', 5));
  }
  console.log('WRITE insert f-studio-6 @4',
    await insert('global.footer.studio-links', 'f-studio-6', 4, { label: 'Workshops', href: '/workshops' }));
} else {
  console.log('f-studio-6 already present');
}

/* ---- verify final order ---- */
const navAfter = await list('global.navigation.links');
console.log('nav:', navAfter.map((x) => `${x.position}:${x.item_id}`).join(' '));
const studioAfter = await list('global.footer.studio-links');
console.log('studio:', studioAfter.map((x) => `${x.position}:${x.item_id}`).join(' '));
