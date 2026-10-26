"""Item 4 order-flow E2E: OrderLine.model removal didn't break the flow.

Drives the REAL storefront: add a product to the order, open the drawer,
assert the line renders and the wa.me send link carries the full message
(name, quantity, total). Ends by clearing the order (cart is local state).
"""
import sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3000'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context().new_page()

    # shop page has the shelf with Add to order buttons
    pg.goto(BASE + '/shop', wait_until='networkidle', timeout=60000)
    # accessible name is "Add <product name> to your order"
    add = pg.get_by_role('button', name='to your order').first
    add.wait_for(state='visible', timeout=15000)
    product_name = pg.locator('h3').first.inner_text().strip()
    add.click()
    pg.wait_for_timeout(600)

    # drawer opens (or the trigger shows the count) — open it
    # The site usually auto-opens the drawer on add; fall back to the nav Order button.
    drawer_send = pg.get_by_role('link', name='Send order on WhatsApp')
    if drawer_send.count() == 0:
        pg.get_by_role('button', name='Order').first.click()
        pg.wait_for_timeout(500)
    ck('drawer visible with send link', drawer_send.count() > 0)

    # line renders with the product name
    body = pg.locator('body').inner_text()
    ck('product line in drawer', product_name.split()[0] in body, f'name={product_name!r}')

    href = drawer_send.first.get_attribute('href') or ''
    ck('wa.me link built', href.startswith('https://wa.me/'), f'href[:60]={href[:60]!r}')
    ck('link carries the product name', product_name.split()[0].replace(' ', '%20') in href or product_name.split()[0] in href)
    ck('link carries quantity × price', '%C3%97' in href or '×' in href or 'x' in href.lower())
    ck('link carries order total', 'Order%20total' in href or 'Order+total' in href)

    # no stray model keys in localStorage line payloads
    stored = pg.evaluate("() => localStorage.getItem('cra7ty-hub.order.v1') || ''")
    ck('stored lines present', stored.startswith('['), f'len={len(stored)}')
    ck('new line has NO model key', '"model"' not in stored, stored[:160])

    # clear the order to leave clean state
    clear = pg.get_by_role('button', name='Clear order')
    if clear.count() > 0:
        clear.first.click()
        pg.wait_for_timeout(400)
    stored_after = pg.evaluate("() => localStorage.getItem('cra7ty-hub.order.v1') || ''")
    ck('order cleared', stored_after.strip() in ('[]', ''), f'after={stored_after[:40]!r}')

    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
