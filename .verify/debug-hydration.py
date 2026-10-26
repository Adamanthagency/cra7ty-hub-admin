"""Isolate the '/' hydration error: does it depend on navigating from the
admin origin first, and what exactly mismatches?"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
STORE = 'http://127.0.0.1:3000'


def attach(pg, sink):
    pg.on('pageerror', lambda e: sink.append('PAGEERROR: ' + str(e)[:500]))
    pg.on('console', lambda m: sink.append(f'CONSOLE[{m.type}]: {m.text[:700]}')
          if m.type in ('error', 'warning') else None)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()

    # --- scenario 1: store only, no admin visit, NO cookie ---
    pg = ctx.new_page()
    logs = []
    attach(pg, logs)
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(2500)
    print('1) store only, no cookie:', len(logs))
    for l in logs: print('   ', l.replace('\n', ' | ')[:400])
    pg.close()

    # --- scenario 2: with admin cookie set, store only ---
    ctx2 = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx2.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx2.new_page()
    logs = []
    attach(pg, logs)
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(2500)
    print('2) store only, admin cookie:', len(logs))
    for l in logs: print('   ', l.replace('\n', ' | ')[:400])
    pg.close()

    # --- scenario 3: admin first, then store (test order) ---
    pg = ctx2.new_page()
    logs = []
    attach(pg, logs)
    pg.goto(ADMIN + '/admin/categories', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(1000)
    print('   (admin loaded, errors so far:', len(logs), ')')
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(2500)
    print('3) admin->store:', len(logs))
    for l in logs: print('   ', l.replace('\n', ' | ')[:600])
    pg.close()

    # --- scenario 4: admin→store AGAIN (second time, like the test) ---
    pg = ctx2.new_page()
    logs = []
    attach(pg, logs)
    pg.goto(ADMIN + '/admin/categories', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(600)
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    pg.wait_for_timeout(2500)
    print('4) admin->store again:', len(logs))
    for l in logs: print('   ', l.replace('\n', ' | ')[:600])

    b.close()
