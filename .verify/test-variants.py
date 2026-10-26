"""Item 3 variant E2E (real admin 3999, real storefront 3000).

Pass A: set home hero=stacked, featured=grid, testimonials=even, faq=stacked
        via each section's Edit form, publish once, assert the served markup
        actually differs per variant.
Pass B: revert all four to defaults, publish, assert today's markup returns.

Assertions are class probes on the served HTML (the layout classes are the
visible difference — a span change moves the whole grid).

Writes reported: page_sections.variant for 4 home sections (×2 publishes).
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
STORE = 'http://127.0.0.1:3000'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


def set_variant(pg, row_text, new_value, current_value):
    """Pages/home → Edit on the row → click the layout chip → Save."""
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    row = pg.locator('li').filter(has_text=row_text).first
    row.get_by_role('button', name='Edit').click()
    pg.wait_for_timeout(400)
    # rows carry an inline Layout group too — the form's panel renders
    # after the list in DOM order, so take the last match
    group = pg.get_by_role('group', name='Layout').last
    group.wait_for(state='visible', timeout=5000)
    if new_value != current_value:
        group.get_by_role('button', name=new_value, exact=True).click()
        pg.wait_for_timeout(200)
    save = pg.get_by_role('button', name='Save changes')
    if save.is_enabled():
        save.click()
        pg.wait_for_timeout(700)
        return True
    # nothing changed (already at target) — close the panel
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    return False


def publish(pg):
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    pub = pg.get_by_role('button', name='Publish', exact=True)
    if pub.count() == 0:
        return True  # nothing to publish
    pub.first.click()
    dlg = pg.get_by_role('dialog')
    dlg.wait_for(state='visible', timeout=5000)
    dlg.get_by_role('button', name='Publish').click()
    for _ in range(30):
        pg.wait_for_timeout(500)
        if pg.get_by_text('unpublished change').count() == 0:
            return True
    return False


def probe(pg, path):
    """Class probes scoped to each variant-bearing section, so other
    sections' grid classes can't produce false hits."""
    pg.goto(STORE + path, wait_until='networkidle', timeout=60000)
    return pg.evaluate('''() => {
      const has = (scope, sel) => {
        const el = document.querySelector(scope);
        return el ? el.querySelectorAll(sel).length : 0;
      };
      return {
        heroSplit: has('#top', '[class*="lg:col-span-5"]'),
        heroStackedCol: has('#top', '.grid > div.col-span-12:not([class*="lg:col-span"])'),
        staggered: has('#shop', '[class*="lg:col-start-7"]'),
        gridCells: has('#shop', 'li[class*="lg:col-span-4"]'),
        offset: has('#about', '[class*="md:col-start-8"]'),
        even: has('#about', 'li[class*="md:col-span-4"]'),
        faqSplit: has('#faq', '[class*="md:col-start-9"]'),
        faqStacked: has('#faq', '[class*="md:col-start-3"]'),
      };
    }''')


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()

    # --- baseline (defaults) ---
    base = probe(pg, '/')
    ck('baseline: hero split', base['heroSplit'] > 0 and base['heroStackedCol'] == 0, json.dumps(base))
    ck('baseline: featured staggered', base['staggered'] > 0 and base['gridCells'] <= 1)
    ck('baseline: testimonials offset', base['offset'] > 0 and base['even'] == 0)
    ck('baseline: faq split', base['faqSplit'] > 0 and base['faqStacked'] == 0)

    # --- Pass A: flip all four ---
    changed = 0
    changed += 1 if set_variant(pg, 'Hero', 'stacked', 'split') else 0
    changed += 1 if set_variant(pg, 'Featured products', 'grid', 'staggered') else 0
    changed += 1 if set_variant(pg, 'Testimonials', 'even', 'offset') else 0
    changed += 1 if set_variant(pg, 'FAQ', 'stacked', 'split') else 0
    ck('all four variants recorded as drafts', changed == 4, f'changed={changed}')
    ck('publish variant changes', publish(pg))

    after = probe(pg, '/')
    ck('hero now STACKED (no 5-col art, full-width child)', 
       after['heroSplit'] == 0 and after['heroStackedCol'] > 0, json.dumps(after))
    ck('featured now GRID (no staggered offsets, all 4-col cells)',
       after['staggered'] == 0 and after['gridCells'] >= 6, f"cells={after['gridCells']}")
    ck('testimonials now EVEN (no offset starts, equal cells)',
       after['offset'] == 0 and after['even'] == 3, f"even={after['even']} offset={after['offset']}")
    ck('faq now STACKED (side card gone, centered below)',
       after['faqSplit'] == 0 and after['faqStacked'] > 0)

    # --- Pass B: revert ---
    changed = 0
    changed += 1 if set_variant(pg, 'Hero', 'split', 'stacked') else 0
    changed += 1 if set_variant(pg, 'Featured products', 'staggered', 'grid') else 0
    changed += 1 if set_variant(pg, 'Testimonials', 'offset', 'even') else 0
    changed += 1 if set_variant(pg, 'FAQ', 'split', 'stacked') else 0
    ck('all four reverts recorded', changed == 4, f'changed={changed}')
    ck('publish reverts', publish(pg))

    back = probe(pg, '/')
    ck('hero back to split', back['heroSplit'] > 0 and back['heroStackedCol'] == 0, json.dumps(back))
    ck('featured back to staggered', back['staggered'] > 0 and back['gridCells'] <= 1, json.dumps(back))
    ck('testimonials back to offset', back['offset'] > 0 and back['even'] == 0)
    ck('faq back to split', back['faqSplit'] > 0 and back['faqStacked'] == 0)

    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
