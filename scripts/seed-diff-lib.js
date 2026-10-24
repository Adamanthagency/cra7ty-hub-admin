/* Seed-accuracy diff: every content.ts/settings.ts seed vs the real
 * storefront source. Run: node scripts/seed-diff.js */
const fs = require('fs');
const path = require('path');

const ADMIN = path.resolve(__dirname, '..');
const SHOP = 'C:/Users/ROG ZEPHYRUS/Projects/cra7ty-hub';

function read(p) { return fs.readFileSync(p, 'utf8'); }

// --- collect storefront corpus (all .ts/.tsx we were allowed to read) ---
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const shopFiles = walk(path.join(SHOP, 'src'));
const corpus = shopFiles.map(read).join('\n');

module.exports = { read, ADMIN, SHOP, walk, shopFiles, corpus };
