"""Post-fix verification for both bugs.

Bug 1: Hero edit panel exposes a Jump-to index; clicking "Hero slideshow"
       brings the list block into the viewport.
Bug 2: product editor dropdown offers every live category (incl. 'bulk'),
       and a category saved as an UNPUBLISHED draft is selectable too.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://localhost:52710'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


cookie = json.loads(Path('.verify/test-session-local.json').read_text())['cookie']
n, v = cookie.split(';', 1)[0].split('=', 1)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # ---------- Bug 1 ----------
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    pg.locator('li').filter(has_text='Hero').first.get_by_role('button', name='Edit').click()
    pg.wait_for_selector('text=Hero slideshow', timeout=15000)

    nav = pg.get_by_role('navigation', name='Jump to a list')
    ck('jump index present at top of the panel', nav.count() == 1)
    chip = nav.get_by_role('button', name='Hero slideshow')
    ck('Hero slideshow chip in the index', chip.count() == 1, f'count={chip.count()}')

    # is the list block initially below the fold?
    before = pg.get_by_text('Hero slideshow', exact=False).first.bounding_box()
    print('label position before jump:', before)

    chip.click()
    pg.wait_for_timeout(900)  # smooth scroll
    after = pg.get_by_text('Hero slideshow', exact=False).first.bounding_box()
    print('label position after jump:', after)
    ck('jump scrolled the slideshow block into view',
       after is not None and 0 <= after['y'] < 800, f'y={after["y"] if after else None}')

    add = pg.get_by_role('button', name='Add slide')
    ck('"Add slide" reachable in viewport', add.count() == 1 and add.first.is_visible())

    # the add button must actually work (creates a row with image + caption)
    add.first.click()
    pg.wait_for_timeout(300)
    ck('adding a slide creates a row', pg.get_by_text('1 item').count() >= 1)
    pg.screenshot(path='.verify/fix1-hero-jump.png')
    # leave the draft in this throwaway browser context only — no publish

    # ---------- Bug 2 (live path) ----------
    pg.goto(f'{ADMIN}/admin/products/new', wait_until='networkidle')
    pg.wait_for_timeout(500)
    opts = pg.locator('#product-category option').all_inner_texts()
    print('product editor options (live):', opts)
    resp = pg.request.get(f'{ADMIN}/admin/api/content')
    live = [c['id'] for c in resp.json().get('categories', [])] if resp.ok else []
    missing = [c for c in live if c not in opts]
    ck('every live category selectable', not missing, f'missing={missing} options={opts}')

    # ---------- Bug 2 (unpublished draft path) ----------
    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle')
    slug = 'test-draft-cat-42'
    pg.get_by_placeholder('e.g. wedding-favours').fill(slug)
    pg.get_by_role('button', name='Add category').click()
    pg.wait_for_timeout(300)
    row = pg.locator('li').filter(has_text=slug).first
    row.get_by_label('Name').fill('Test Draft Cat')
    row.get_by_label('Blurb').fill('Temporary row created by the bug-fix verification run.')
    pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Save to drafts').click()
    pg.wait_for_timeout(500)
    ck('category draft saved', pg.get_by_text('Saved to drafts').count() > 0)

    pg.goto(f'{ADMIN}/admin/products/new', wait_until='networkidle')
    pg.wait_for_timeout(500)
    opts2 = pg.locator('#product-category option').all_inner_texts()
    print('product editor options (with draft):', opts2)
    ck('drafted category selectable immediately', slug in opts2, f'options={opts2}')

    # ---------- products filter dropdown ----------
    pg.goto(f'{ADMIN}/admin/products', wait_until='networkidle')
    pg.wait_for_timeout(700)
    filt = pg.get_by_label('Filter by category').locator('option').all_inner_texts()
    print('filter options:', filt)
    ck('filter shows live categories too', 'bulk' in filt, f'options={filt}')

    if errors:
        ck('no page errors', False, '; '.join(errors[:3]))
    else:
        ck('no page errors', True)
    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
