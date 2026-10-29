"""Bug walkthrough: (1) Hero slideshow field visibility, (2) category dropdown staleness.

Run against the local admin dev server with a real session cookie
(.verify/test-session-local.json, produced by .verify/get-session-local.mjs).
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
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)

    # ---------- Bug 1: Hero slideshow in Pages > Home > Hero > Edit ----------
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    row = pg.locator('li').filter(has_text='Hero').first
    row.get_by_role('button', name='Edit').click()
    pg.wait_for_timeout(700)
    body_text = pg.locator('body').inner_text().replace('\n', ' | ')
    has_slideshow = 'Hero slideshow' in body_text
    ck('workbench: "Hero slideshow" visible in Hero edit panel', has_slideshow)
    print('--- panel text excerpt ---')
    # print the side panel region only
    slides = pg.get_by_text('Hero slideshow', exact=False)
    print(f'occurrences of "Hero slideshow": {slides.count()}')
    if slides.count() > 0:
        first = slides.first
        print('visible:', first.is_visible())
        try:
            print('box:', first.bounding_box())
        except Exception as e:
            print('box err', e)
    add_slide = pg.get_by_role('button', name='Add slide')
    print(f'"Add slide" buttons: {add_slide.count()}')
    ck('workbench: "Add slide" button present', add_slide.count() > 0)

    # screenshot for evidence
    pg.screenshot(path='.verify/bug1-workbench-hero.png', full_page=False)

    # close panel
    pg.keyboard.press('Escape')
    pg.goto(f'{ADMIN}/admin/pages', wait_until='networkidle')

    # ---------- Bug 2: category options in product editor ----------
    # live categories from the categories manager
    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle')
    pg.wait_for_timeout(500)
    body = pg.locator('body').inner_text()
    print('--- categories page body (first 600 chars) ---')
    print(body[:600])

    pg.goto(f'{ADMIN}/admin/products/new', wait_until='networkidle')
    pg.wait_for_timeout(600)
    opts = pg.locator('#product-category option').all_inner_texts()
    print('product editor category options:', opts)
    pg.screenshot(path='.verify/bug2-product-category.png')

    # live category ids from the API (authoritative)
    resp = pg.request.get(f'{ADMIN}/admin/api/content')
    live = None
    if resp.ok:
        data = resp.json()
        live = [c.get('id') for c in data.get('categories', [])]
    print('live categories from /admin/api/content:', live)

    if live:
        missing = [c for c in live if c not in opts]
        ck('product editor shows every live category', not missing, f'missing={missing}')

    if logs:
        print('--- console errors/warnings ---')
        print('\n'.join(logs[:20]))
    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
