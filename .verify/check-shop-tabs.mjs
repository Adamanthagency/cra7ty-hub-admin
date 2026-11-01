// Post-deploy check: the live /shop tab strip must offer no `courses`
// tab (the category row is filtered on the server), while the site
// navbar's legitimate "Courses" nav link stays. Read-only.
const res = await fetch('https://www.cra7tyhub.com/shop', {
  headers: { 'cache-control': 'no-cache' },
});
const html = await res.text();
console.log('/shop HTTP', res.status);

// Where does ">courses<" appear at all? (expect: only the navbar link)
const hits = [...html.matchAll(/.{50}>[Cc]ourses<.{10}/g)].map((m) =>
  m[0].replace(/\s+/g, ' '),
);
console.log('">courses<" occurrences:', hits.length);
hits.slice(0, 5).forEach((h) => console.log('  ...' + h + '...'));

// The shop tabs render each category id as a lowercase label in a button.
const cats = [
  ...new Set(
    [...html.matchAll(/<button[^>]*>\s*(table|party|gift|bulk|paper|digitalproduct|courses)\s*</g)].map(
      (m) => m[1],
    ),
  ),
];
console.log('category tab labels in the tab strip:', cats.join(', ') || '(none found)');
console.log('courses tab present:', cats.includes('courses'));
