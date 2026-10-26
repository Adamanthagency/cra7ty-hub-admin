import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:250]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:250]))
    pg.goto(ADMIN + '/admin/categories', wait_until='networkidle')
    pg.wait_for_timeout(2500)
    ids = pg.evaluate(
        """() => [...document.querySelectorAll('ul.space-y-3 > li')]
              .map(r => (r.querySelector('[class*="text-[10px]"]') || {}).textContent)"""
    )
    print('rows:', ids)
    print('header:', pg.evaluate('() => document.body.innerText.slice(0, 160)'))
    print('errors:', json.dumps(errs[:8], indent=1))
    b.close()
