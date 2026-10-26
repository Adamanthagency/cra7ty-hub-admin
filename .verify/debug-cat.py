"""Diagnostic: (1) where the home hydration error comes from, (2) what the
admin categories page actually renders after the publish."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
STORE = 'http://127.0.0.1:3000'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()

    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    cons = []
    pg.on('console', lambda m: cons.append(f'{m.type}: {m.text[:220]}') if m.type in ('error', 'warning') else None)

    print('=== STOREFRONT / ===')
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(1500)
    print('pageerrors:', json.dumps(errs, indent=1))
    print('console:', json.dumps(cons[:8], indent=1))

    errs.clear(); cons.clear()
    print('=== STOREFRONT /shop ===')
    pg.goto(STORE + '/shop', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(1500)
    print('pageerrors:', json.dumps(errs, indent=1))
    print('console:', json.dumps(cons[:8], indent=1))

    errs.clear(); cons.clear()
    print('=== STOREFRONT / (repeat x3 for hydration check) ===')
    for i in range(3):
        pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
        pg.wait_for_timeout(1200)
        print(f'run {i}: pageerrors={len(errs)} console_errs={len(cons)}')
        if errs: print('  ', errs[-1][:250])
        if cons: print('  ', cons[-1][:250])
        errs.clear(); cons.clear()

    errs.clear(); cons.clear()
    print('=== ADMIN /admin/categories ===')
    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(1500)
    print('pageerrors:', json.dumps(errs, indent=1))
    print('console:', json.dumps(cons[:8], indent=1))
    state = pg.evaluate('''() => {
      const rows = [...document.querySelectorAll('ul.space-y-3 > li')];
      return {
        url: location.pathname,
        rowCount: rows.length,
        ids: rows.map(r => (r.querySelector('[class*="text-[10px]"]') || {}).textContent || '?'),
        removeLabels: [...document.querySelectorAll('button[aria-label^="Remove"]')].map(b => b.getAttribute('aria-label')),
        addInput: !!document.querySelector('input[placeholder*="wedding"]'),
        bodyText: document.body.innerText.slice(0, 400),
      };
    }''')
    print('state:', json.dumps(state, indent=1))

    b.close()
