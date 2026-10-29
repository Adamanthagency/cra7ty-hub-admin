"""Visual-editor path to the Hero slideshow list (the gap from bug 1).

Admin frames the local storefront with ?cra7ty-edit=1; clicking the hero
art region must post the list key and open the SAME ListEditor the
workbench shows (label "Hero slideshow" + "Add slide").
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
    ctx = b.new_context(viewport={'width': 1600, 'height': 950})
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    pg.goto(f'{ADMIN}/admin/pages/home/visual', wait_until='networkidle')

    frame = pg.frame_locator('iframe[title="Storefront preview"]')
    key = frame.locator('[data-cra7ty-key="home.hero.slideshow"]')
    try:
        key.first.wait_for(state='visible', timeout=30000)
        ck('hero art region carries the slideshow key in edit mode', True)
    except Exception as e:
        ck('hero art region carries the slideshow key in edit mode', False, str(e)[:120])
        # fall through to diagnostics
        print('frames:', [f.url for f in pg.frames])
        b.close()
        sys.exit(1)

    # cursor/hover affordance: the wrapper should be a block-sized region
    box = key.first.bounding_box()
    print('art region box:', box)
    ck('region is block-sized (not a degenerate inline)', box and box['height'] > 200,
       f"h={box['height'] if box else None}")

    key.first.click()
    pg.wait_for_timeout(1200)

    panel = pg.get_by_label('Visual editor panel')
    panel_text = panel.inner_text() if panel.count() else ''
    ck('panel opens the Hero slideshow list', 'Hero slideshow' in panel_text,
       panel_text.replace('\n', ' | ')[:160])
    add = panel.get_by_role('button', name='Add slide')
    ck('Add slide offered from the visual editor', add.count() == 1, f'count={add.count()}')

    # selecting from the frame must also register the key (set-field gate)
    pg.screenshot(path='.verify/fix3-visual-slideshow.png')
    ck('no page errors', not errors, '; '.join(errors[:3]))
    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
