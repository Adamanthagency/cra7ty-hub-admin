/* Match every extracted seed against the storefront corpus and report:
 *   matched count, plus the unmatched list (which must be classified).
 * Known transforms applied before matching (tokens, computed strings).
 */
const { seeds, corpus, shopFiles } = require('./seed-diff-extract');

/** Corpus, whitespace-collapsed, for substring matching. */
const flat = corpus.replace(/\s+/g, ' ');

function normalize(s) {
  return s
    .replace(/\{shown\}/g, '6')        // featured shown count (6 featured ids)
    .replace(/\{total\}/g, '11')       // products.length = 11 in the real repo
    .replace(/₦50,000/g, '₦50,000');
}

function match(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length === 0) return true;
  if (flat.includes(t)) return true;
  if (flat.includes(normalize(t))) return true;
  // template-literal backticks in source: strip them
  const bare = t.replace(/[`]/g, '');
  if (flat.includes(bare)) return true;
  return false;
}

const matched = [];
const unmatched = [];
for (const seed of seeds) {
  const text = seed.text.trim();
  if (text.length < 2) continue; // skip tiny fragments like '/', '01'
  (match(text) ? matched : unmatched).push({ type: seed.type, text });
}

// dedupe unmatched by text
const seen = new Set();
const unmatchedUnique = unmatched.filter((u) => {
  if (seen.has(u.text)) return false;
  seen.add(u.text);
  return true;
});

console.log(`storefront files scanned: ${shopFiles.length}`);
console.log(`seeds extracted: ${seeds.length}`);
console.log(`MATCHED: ${matched.length}`);
console.log(`UNMATCHED: ${unmatchedUnique.length}`);
console.log('--- UNMATCHED ---');
for (const u of unmatchedUnique) console.log(`[${u.type}] ${u.text.slice(0, 140)}`);
