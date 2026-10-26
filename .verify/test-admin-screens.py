"""Stage 7 screens pass — the six rewired admin screens render REAL data.

Drives the admin on 127.0.0.1:3998 with a real session cookie (obtained
via the lib-auth generate_link flow, same as the API test). Seeds two
orders through the checkout RPCs (one paid, one pending), then checks
each screen shows them. All seeded rows are deleted afterwards.
"""
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3998'
ROOT = Path(__file__).resolve().parent.parent
TEST_EMAIL = 'stage7ui@example.com'


def load_env():
    env = {}
    for line in (ROOT / '.env.local').read_text(encoding='utf-8').splitlines():
        m = re.match(r'^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$', line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


ENV = load_env()
SB_URL = ENV['NEXT_PUBLIC_SUPABASE_URL']
SB_KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']


def db(method, table, query='', body=None):
    url = f'{SB_URL}/rest/v1/{table}' + (f'?{query}' if query else '')
    req = urllib.request.Request(url, method=method)
    req.add_header('apikey', SB_KEY)
    req.add_header('Authorization', f'Bearer {SB_KEY}')
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=representation')
    with urllib.request.urlopen(req, data=data, timeout=20) as res:
        text = res.read().decode()
        return json.loads(text) if text else []


def rpc(fn, args):
    url = f'{SB_URL}/rest/v1/rpc/{fn}'
    req = urllib.request.Request(url, method='POST')
    req.add_header('apikey', SB_KEY)
    req.add_header('Authorization', f'Bearer {SB_KEY}')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, data=json.dumps(args).encode(), timeout=20) as res:
        text = res.read().decode()
        return json.loads(text) if text else None


def session_cookie():
    out = subprocess.run(
        ['node', '-e',
         "import('./.verify/lib-auth.mjs').then(m => m.adminLogin('http://127.0.0.1:3998'))"
         '.then(c => console.log(c))'],
        cwd=ROOT, capture_output=True, text=True, shell=True,
    )
    line = [l for l in out.stdout.splitlines() if 'ch_admin_session=' in l]
    if not line:
        raise RuntimeError(f'login failed: {out.stdout} {out.stderr}')
    return line[-1].split('ch_admin_session=')[1].split(';')[0]


results = []


def check(name, ok, detail=''):
    results.append((name, ok))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else f'  -> {detail}'))


def body_has(page, marker, timeout_ms=20000):
    """Poll until `marker` appears in the rendered body (first compile of a
    dev route can take several seconds — a fixed sleep is a flaky test).
    textContent, not innerText: chart axis labels live in SVG <text>,
    which innerText omits."""
    try:
        page.wait_for_function(
            "m => (document.body.textContent || '').includes(m)",
            arg=marker, timeout=timeout_ms,
        )
        return True
    except Exception:
        return False


def body_text(page):
    return page.evaluate('document.body.textContent || ""')


def seed():
    product = db('GET', 'products',
                 'status=eq.active&stock=gt.5&order=stock.desc&select=id,name,stock,price&limit=1')[0]
    customer = {'name': 'Stage Seven UI', 'email': TEST_EMAIL,
                'phone': '08000000007', 'address': '7 Verification Lane, Lagos'}

    def mk():
        return rpc('create_checkout_order', {
            'p_lines': [{'productId': product['id'], 'quantity': 1}],
            'p_customer': customer, 'p_coupon': None})

    paid = mk()
    rpc('confirm_paid_order', {'p_reference': paid['reference'],
                               'p_amount_kobo': paid['total'] * 100,
                               'p_source': 'webhook'})
    pending = mk()
    return product, paid, pending


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    product, paid, pending = seed()
    print(f"seeded: {paid['orderNumber']} (paid), {pending['orderNumber']} (pending)")
    cookie = session_cookie()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1360, 'height': 900})
        ctx.add_cookies([{
            'name': 'ch_admin_session', 'value': cookie,
            'domain': '127.0.0.1', 'path': '/',
        }])
        page = ctx.new_page()

        # Orders list: both seeded orders render with payment status.
        page.goto(f'{ADMIN}/admin/orders', wait_until='networkidle', timeout=90000)
        paid_seen = body_has(page, paid['orderNumber'])
        body = body_text(page)
        check('Orders screen shows the paid order + its payment status',
              paid_seen and 'paid' in body,
              f"paidSeen={paid_seen} body={body[:300]}")
        check('Orders screen shows the pending order', pending['orderNumber'] in body)

        # Detail: open the paid one, items + totals render.
        page.goto(f'{ADMIN}/admin/orders/{paid["orderNumber"]}',
                  wait_until='networkidle', timeout=90000)
        detail_seen = body_has(page, product['name'][:18])
        body = body_text(page)
        check('Detail screen renders items + product name',
              detail_seen and 'Order details' in body, body[:300])
        check('Detail shows the customer email', TEST_EMAIL in body)

        # Tracker: seeded rows and quick status update through the API.
        page.goto(f'{ADMIN}/admin/tracker', wait_until='networkidle', timeout=90000)
        tracker_seen = body_has(page, pending['orderNumber'])
        check('Tracker shows the seeded orders', tracker_seen)

        # Dashboard: real counts + review banner absent (no mismatch here).
        page.goto(f'{ADMIN}/admin/dashboard', wait_until='networkidle', timeout=90000)
        dash_seen = body_has(page, 'Recent orders')
        body = body_text(page)
        check('Dashboard has no Demo-data banner anymore', dash_seen and 'Demo data' not in body)
        check('Dashboard shows real recent orders',
              pending['orderNumber'] in body or paid['orderNumber'] in body, body[:300])

        # Analytics: totals strip + charts (no Coming soon).
        page.goto(f'{ADMIN}/admin/analytics', wait_until='networkidle', timeout=90000)
        analytics_seen = body_has(page, 'Paid revenue', timeout_ms=30000)
        body = body_text(page)
        check('Analytics renders paid revenue + no Coming soon',
              analytics_seen and 'Coming soon' not in body, body[:300])
        check('Analytics top-products chart names the real product',
              product['name'][:18] in body, body[:300])

        # Promo codes: create one through the UI, delete it through the UI.
        page.goto(f'{ADMIN}/admin/promo-codes', wait_until='networkidle', timeout=90000)
        body_has(page, 'New code')
        page.get_by_role('button', name='New code').click()
        page.locator('#promo-code').fill('STAGE7UI')
        page.locator('#promo-value').fill('12')
        page.get_by_role('button', name='Save code').click()
        body_has(page, 'STAGE7UI', timeout_ms=15000)
        body = body_text(page)
        check('Promo screen: code created via UI appears in the table',
              'STAGE7UI' in body, body[:200])
        row = db('GET', 'coupon_codes', f'code=eq.STAGE7UI&select=id,usage_count')
        check('Promo row persisted with uuid id + usage_count 0',
              len(row) == 1 and row[0]['usage_count'] == 0 and
              re.match(r'^[0-9a-f-]{36}$', row[0]['id']), json.dumps(row))

        page.on('dialog', lambda d: d.accept())
        page.get_by_role('button', name='Delete STAGE7UI').click()
        page.wait_for_timeout(2000)
        gone = db('GET', 'coupon_codes', 'code=eq.STAGE7UI')
        check('Promo screen: code deleted via UI is gone from the DB',
              len(gone) == 0)

        browser.close()

    # cleanup seeded orders + restore stock
    db('DELETE', 'orders', f'customer_email=eq.{TEST_EMAIL}')
    db('PATCH', f'products?id=eq.{urllib.parse.quote(product["id"])}', '',
       {'stock': product['stock']})
    print(f"cleanup: UI-test orders deleted, stock of {product['id']} restored to {product['stock']}")

    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
