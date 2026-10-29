"""Live production verification after deploy.

Admin (https://cra7ty-hub-admin.vercel.app):
 1. Workbench: Pages > Home > Hero > Edit exposes the Jump-to index and
    clicking "Hero slideshow" scrolls the block into view.
 2. Product editor: every live category is selectable.
 3. Visual editor: clicking the hero art in the framed storefront opens
    the same Hero slideshow ListEditor (storefront change deployed).
Storefront: production homepage returns 200.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'https://cra7ty-hub-admin.vercel.app'
STORE = 'https://www.cra7tyhub.com'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


# fresh real session against the LIVE admin (generate_link → verify → exchange)
import subprocess
Path('.verify/_live-login.mjs').write_text(
    "import { adminLogin } from './lib-auth.mjs';\n"
    "process.stdout.write(await adminLogin('https://cra7ty-hub-admin.vercel.app'));\n",
    encoding='utf-8',
)
out = subprocess.run(['node', '.verify/_live-login.mjs'],
                     capture_output=True, text=True, timeout=90)
cookie = (out.stdout or '').strip()
if not cookie:
    print('LIVE LOGIN FAILED:', out.stderr[:400])
    sys.exit(1)

n, v = cookie.split(';', 1)[0].split('=', 1)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1600, 'height': 950})
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # ---- 1. workbench jump index ----
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    pg.locator('li').filter(has_text='Hero').first.get_by_role('button', name='Edit').click()
    try:
        pg.wait_for_selector('text=Hero slideshow', timeout=30000)
        ck('live Hero panel contains the slideshow list', True)
    except Exception as e:  # noqa: BLE001
        ck('live Hero panel contains the slideshow list', False, str(e)[:120])
    nav = pg.get_by_role('navigation', name='Jump to a list')
    ck('live jump index present', nav.count() == 1, f'count={nav.count()}')
    target = pg.locator('#section-list-home\\.hero\\.slideshow')
    before = target.bounding_box()
    nav.get_by_role('button', name='Hero slideshow').click()
    pg.wait_for_timeout(1000)
    after = target.bounding_box()
    print('live jump: before', before, '-> after', after)
    ck('live jump scrolls the block into view',
       after is not None and 0 <= after['y'] < 800,
       f"y={after['y'] if after else None}")

    # ---- 2. live product editor categories ----
    pg.goto(f'{ADMIN}/admin/products/new', wait_until='networkidle')
    pg.wait_for_timeout(800)
    opts = pg.locator('#product-category option').all_inner_texts()
    resp = pg.request.get(f'{ADMIN}/admin/api/content')
    live = [c['id'] for c in resp.json().get('categories', [])] if resp.ok else []
    missing = [c for c in live if c not in opts]
    ck('live product editor shows every live category', not missing,
       f'live={live} missing={missing}')

    # ---- 3. live visual editor frames the storefront and opens the list ----
    pg.goto(f'{ADMIN}/admin/pages/home/visual', wait_until='networkidle')
    frame = pg.frame_locator('iframe[title="Storefront preview"]')
    try:
        key = frame.locator('[data-cra7ty-key="home.hero.slideshow"]')
        key.first.wait_for(state='visible', timeout=45000)
        ck('live storefront frames with the slideshow key', True)
        key.first.click()
        pg.wait_for_timeout(1500)
        panel = pg.get_by_label('Visual editor panel')
        text = panel.inner_text() if panel.count() else ''
        ck('live visual editor opens the Hero slideshow list',
           'Add slide' in text, text.replace('\n', ' | ')[:140])
    except Exception as e:  # noqa: BLE001
        ck('live visual editor opens the Hero slideshow list', False, str(e)[:160])
    pg.screenshot(path='.verify/live-visual.png')

    ck('no page errors', not errors, '; '.join(errors[:3]))
    b.close()

# ---- storefront homepage ----
import urllib.request
try:
    r = urllib.request.urlopen(STORE, timeout=30)
    ck('storefront homepage 200', r.status == 200, f'status={r.status}')
except Exception as e:  # noqa: BLE001
    ck('storefront homepage 200', False, str(e)[:120])

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
