/**
 * Post-deploy verification of the Events announcement feed on PRODUCTION.
 * Run: node .verify/e2e-event-posts-live.mjs
 *
 * Every check is read-only except the explicitly-named WRITE steps: one
 * test announcement created (draft → published → date moved → deleted).
 * The Tier 6 regression block re-reads /workshops and a real workshop
 * detail page to prove the paid registration system is untouched.
 *
 * Writes reported: create (draft), update (publish), update (date move),
 * DELETE (cleanup) — all against event_posts only.
 */
import { adminLogin } from './lib-auth.mjs';

const ADMIN = 'https://cra7ty-hub-admin.vercel.app';
const SHOP = 'https://www.cra7tyhub.com';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function hit(url, opts = {}) {
  const res = await fetch(url, { redirect: 'manual', ...opts });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}

const TEST_TITLE = 'ZZ Verify Test Announcement';

async function main() {
  /* 1. API posture — no session */
  const anon = await hit(`${ADMIN}/admin/api/event-posts`);
  check('GET without session → 401', anon.status === 401, `HTTP ${anon.status}`);

  /* 2. login */
  const cookie = await adminLogin(ADMIN);
  check('admin login → cookie', Boolean(cookie));

  /* 3. empty-state list (no seed fallback) */
  const list = await hit(`${ADMIN}/admin/api/event-posts`, { headers: { cookie } });
  check(
    'GET with session → 200 list',
    list.status === 200 && Array.isArray(list.json?.eventPosts),
    `HTTP ${list.status}, ${list.json?.eventPosts?.length ?? '?'} posts`,
  );

  /* 4. publish gate — image required */
  const noImage = await hit(`${ADMIN}/admin/api/event-posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      id: 'event-post-verify-noimg',
      title: TEST_TITLE,
      description: 'should be rejected',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      imageUrl: null,
      linkUrl: null,
      linkLabel: 'Learn more',
      status: 'published',
    }),
  });
  check(
    'POST publish without image → 400',
    noImage.status === 400 && /image/i.test(noImage.json?.error ?? ''),
    `HTTP ${noImage.status} ${noImage.json?.error ?? ''}`,
  );

  /* 5. absolute-URL link rejected (open-redirect guard) */
  const badLink = await hit(`${ADMIN}/admin/api/event-posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      id: 'event-post-verify-badlink',
      title: TEST_TITLE,
      description: '',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      imageUrl: 'https://example.com/x.png',
      linkUrl: 'https://evil.example.com/phish',
      linkLabel: 'Register',
      status: 'draft',
    }),
  });
  check(
    'POST with absolute-URL link → 400',
    badLink.status === 400 && /path on this site/i.test(badLink.json?.error ?? ''),
    `HTTP ${badLink.status} ${badLink.json?.error ?? ''}`,
  );

  /* 6. WRITE 1 — create a real draft (borrow a hosted image for the publish step) */
  const products = await hit(`${ADMIN}/admin/api/products`, { headers: { cookie } });
  const donor = (products.json?.products ?? []).find((p) => p.images?.[0]?.startsWith('http'));
  const postId = `event-post-verify-${Date.now()}`;
  const future = new Date(Date.now() + 3 * 86400000);
  future.setHours(18, 0, 0, 0);
  const draft = await hit(`${ADMIN}/admin/api/event-posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      id: postId,
      title: TEST_TITLE,
      description: 'Temporary production-verification announcement — safe to delete.',
      eventDate: future.toISOString(),
      imageUrl: null,
      linkUrl: null,
      linkLabel: 'Learn more',
      status: 'draft',
      createdAt: new Date().toISOString(),
    }),
  });
  check('WRITE 1: create draft → 200', draft.status === 200 && draft.json?.ok === true,
    `HTTP ${draft.status} ${draft.json?.error ?? ''}`);
  console.log('  WRITE  event_posts INSERT (draft) id=' + postId);

  /* 7. draft invisible on the live /events */
  const eventsWhileDraft = await hit(`${SHOP}/events`, { headers: { 'cache-control': 'no-cache' } });
  check(
    'draft absent from live /events',
    eventsWhileDraft.status === 200 && !eventsWhileDraft.text.includes(TEST_TITLE),
    `HTTP ${eventsWhileDraft.status}`,
  );

  /* 8. WRITE 2 — publish (with image + a link exercising the button path).
   * No Tier 6 workshop is published right now (the calendar is empty),
   * so the link points at /workshops itself — a real internal path, which
   * is all the validator requires — to prove the card's outbound-button
   * rendering without writing to Tier 6's tables. */
  const workshops = await hit(`${SHOP}/workshops`, { headers: { 'cache-control': 'no-cache' } });
  const slugMatch = workshops.text.match(/href="\/workshops\/([a-z0-9-]+)"/);
  const workshopSlug = slugMatch ? slugMatch[1] : null;
  // Fall back to the calendar itself when no workshop is published.
  const linkTarget = workshopSlug ? `/workshops/${workshopSlug}` : '/workshops';
  console.log('  link target:', linkTarget, workshopSlug ? '(real workshop)' : '(calendar — none published)');

  const published = await hit(`${ADMIN}/admin/api/event-posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      id: postId,
      title: TEST_TITLE,
      description: 'Temporary production-verification announcement — safe to delete.',
      eventDate: future.toISOString(),
      imageUrl: donor?.images?.[0] ?? null,
      linkUrl: linkTarget,
      linkLabel: 'Register',
      status: 'published',
      createdAt: new Date().toISOString(),
    }),
  });
  check('WRITE 2: publish → 200 (revalidate ok)',
    published.status === 200 && published.json?.revalidate?.ok === true,
    `HTTP ${published.status} revalidate=${JSON.stringify(published.json?.revalidate)}`);
  console.log('  WRITE  event_posts UPSERT (published) id=' + postId);

  /* 9. published post appears on live /events with the outbound button */
  let eventsHtml = '';
  let visible = false;
  for (let i = 0; i < 8; i++) {
    const r = await hit(`${SHOP}/events`, { headers: { 'cache-control': 'no-cache' } });
    eventsHtml = r.text;
    visible = eventsHtml.includes(TEST_TITLE);
    if (visible) break;
    await new Promise((res) => setTimeout(res, 5000));
  }
  check('published post visible on live /events', visible);
  check('card carries the Register button', eventsHtml.includes('Register'));
  check(
    'card links the outbound target',
    eventsHtml.includes(`href="${linkTarget}"`),
    linkTarget,
  );
  check('listed under Upcoming (future date)', /id="events-upcoming"[\s\S]*?ZZ Verify/.test(eventsHtml));

  /* 10. WRITE 3 — move the date into the past */
  const pastDate = new Date(Date.now() - 2 * 86400000).toISOString();
  const moved = await hit(`${ADMIN}/admin/api/event-posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      id: postId,
      title: TEST_TITLE,
      description: 'Temporary production-verification announcement — safe to delete.',
      eventDate: pastDate,
      imageUrl: donor?.images?.[0] ?? null,
      linkUrl: workshopSlug ? `/workshops/${workshopSlug}` : null,
      linkLabel: 'Register',
      status: 'published',
      createdAt: new Date().toISOString(),
    }),
  });
  check('WRITE 3: date move → 200', moved.status === 200 && moved.json?.ok === true,
    `HTTP ${moved.status}`);
  console.log('  WRITE  event_posts UPSERT (event_date past) id=' + postId);

  let movedHtml = '';
  for (let i = 0; i < 8; i++) {
    const r = await hit(`${SHOP}/events`, { headers: { 'cache-control': 'no-cache' } });
    movedHtml = r.text;
    const pastIdx = movedHtml.indexOf('id="events-past"');
    if (pastIdx !== -1 && movedHtml.slice(pastIdx).includes(TEST_TITLE)) break;
    await new Promise((res) => setTimeout(res, 5000));
  }
  const pastSection = movedHtml.slice(movedHtml.indexOf('id="events-past"'));
  check('moved post now under Past', pastSection.includes(TEST_TITLE));

  /* 11. TIER 6 REGRESSION — untouched (their own API + their own page) */
  const tier6Api = await hit(`${ADMIN}/admin/api/events`, { headers: { cookie } });
  check(
    'Tier 6 API /admin/api/events → 200 (untouched)',
    tier6Api.status === 200 && Array.isArray(tier6Api.json?.events),
    `HTTP ${tier6Api.status}, ${tier6Api.json?.events?.length ?? '?'} events`,
  );
  check('/workshops still 200', workshops.status === 200, `HTTP ${workshops.status}`);
  const tier6Rendered =
    /spot|Unlimited seats|Full — waitlist|No dates/i.test(workshops.text);
  check('/workshops renders (calendar or honest empty state)', tier6Rendered);
  if (workshopSlug) {
    const detail = await hit(`${SHOP}/workshops/${workshopSlug}`);
    const hasPaymentUi = /pay|register|ticket/i.test(detail.text);
    check(
      `workshop detail /workshops/${workshopSlug} renders registration flow`,
      detail.status === 200 && hasPaymentUi,
      `HTTP ${detail.status}`,
    );
  } else {
    console.log('  (no published workshop for a detail-page check — Tier 6 API + calendar page verified instead)');
  }

  /* 12. WRITE 4 — delete the test row (cleanup) */
  const del = await hit(`${ADMIN}/admin/api/event-posts?id=${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: { cookie },
  });
  check('WRITE 4: DELETE → 200', del.status === 200 && del.json?.ok === true, `HTTP ${del.status}`);
  console.log('  WRITE  event_posts DELETE id=' + postId);

  const after = await hit(`${ADMIN}/admin/api/event-posts`, { headers: { cookie } });
  check(
    'row gone from the API',
    !(after.json?.eventPosts ?? []).some((p) => p.id === postId),
  );
  let goneFromSite = false;
  for (let i = 0; i < 8; i++) {
    const r = await hit(`${SHOP}/events`, { headers: { 'cache-control': 'no-cache' } });
    if (!r.text.includes(TEST_TITLE)) { goneFromSite = true; break; }
    await new Promise((res) => setTimeout(res, 5000));
  }
  check('row gone from live /events', goneFromSite);

  /* 13. the empty state renders again (no posts remain) — polled, since
   * the delete's revalidation can transiently serve a mid-regen response */
  let emptyState = false;
  for (let i = 0; i < 8; i++) {
    const r = await hit(`${SHOP}/events`, { headers: { 'cache-control': 'no-cache' } });
    if (r.status === 200 && r.text.includes('Nothing announced yet')) {
      emptyState = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  check('empty state renders when no posts exist', emptyState);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => `${f.name} (${f.detail})`).join(' | '));
    process.exit(1);
  }
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
