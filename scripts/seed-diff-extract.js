/* Extract seed values from the admin mock files, then match each against
 * the storefront corpus. Usage: node scripts/seed-diff.js */
const { read, ADMIN, corpus, shopFiles } = require('./seed-diff-lib');

// Strip TS syntax crudely: we only need the string literals that are seeds.
const contentSrc = read(`${ADMIN}/src/data/mock/content.ts`);
const settingsSrc = read(`${ADMIN}/src/data/mock/settings.ts`);

/** Pull value: '...' / value: "..." entries (multiline-safe). */
function extractScalars(src) {
  const out = [];
  const re = /value:\s*\n?\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push({ type: 'value', text: unescape1(m[1]) });
  const re2 = /value:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;
  while ((m = re2.exec(src)) !== null) out.push({ type: 'value', text: unescape1(m[1]) });
  return out;
}

/** Pull fields: { a: 'x', b: 'y' } string entries from list seeds. */
function extractFields(src) {
  const out = [];
  const re = /fields:\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    const sre = /:\s*'((?:[^'\\]|\\.)*)'/g;
    let s;
    while ((s = sre.exec(body)) !== null) out.push({ type: 'field', text: unescape1(s[1]) });
  }
  return out;
}

function unescape1(s) {
  return s.replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// settings: pull all string values + seo entries
function extractSettings(src) {
  const out = [];
  const re = /:\s*\n?\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const t = unescape1(m[1]);
    if (t.length > 0) out.push({ type: 'setting', text: t });
  }
  return out;
}

const seeds = [
  ...extractScalars(contentSrc),
  ...extractFields(contentSrc),
  ...extractSettings(settingsSrc),
];

module.exports = { seeds, corpus, shopFiles };
