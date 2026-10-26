"""Reproduce the 502 on the category-removal publish and capture the exact
error text the admin displays. Leaves the removal draft pending on screen
so it can be re-published after the fix."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
NEW_ID = 'wedding-favours'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()

    resp = []
    pg.on('response', lambda r: resp.append((r.status, r.url)) if '/admin/api/publish' in r.url else None)

    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle')
    pg.wait_for_timeout(3000)  # live content fetch (post-restart first compile is slow)

    rm = pg.get_by_role('button', name=f'Remove {NEW_ID} category')
    print('remove button count:', rm.count())
    if rm.count() == 0:
        print('nothing to remove — already at baseline')
    else:
        rm.click()
        pg.wait_for_timeout(300)
        save = pg.get_by_role('button', name='Save to drafts')
        print('save enabled:', save.is_enabled())
        save.click()
        pg.wait_for_timeout(400)

        pub = pg.get_by_role('button', name='Publish', exact=True)
        print('publish button count:', pub.count())
        pub.first.click()
        dlg = pg.get_by_role('dialog')
        dlg.wait_for(state='visible', timeout=5000)
        dlg.get_by_role('button', name='Publish').click()
        pg.wait_for_timeout(6000)

        # the note in the draft bar / published note area
        for sel in ['[role="status"]', 'p']:
            pass
        notes = pg.evaluate('''() => [...document.querySelectorAll('[role="status"]')]
            .map(e => e.innerText.trim()).filter(Boolean)''')
        print('NOTES:', json.dumps(notes, indent=1))
        alerts = pg.evaluate('''() => [...document.querySelectorAll('[role="alert"]')]
            .map(e => e.innerText.trim()).filter(Boolean)''')
        print('ALERTS:', json.dumps(alerts, indent=1))
        print('publish responses:', resp)
        drafts = pg.evaluate('''() => document.body.innerText.includes('unpublished change')''')
        print('drafts still pending:', drafts)

    input_state = pg.evaluate('window.localStorage.getItem("cra7ty.drafts.v1")')
    print('stored drafts:', (input_state or '')[:300])
    b.close()
