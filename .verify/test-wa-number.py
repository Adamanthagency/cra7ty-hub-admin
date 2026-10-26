"""WhatsApp number quick-fix E2E, including the settings-publish fix.

Proves:
  1. Save DISABLED with placeholder (baseline bug reproduced)
  2. Save ENABLED with 2348147632371 (validation cleared)
  3. Save -> Publish -> draft bar clears
  4. LIVE DB value == 2348147632371 (the publish-failure fix proven)
  5. No digit-only garbage keys in site_settings (Object.assign side effect absent)
"""
import json
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:3999'
COOKIE = json.loads(Path('.verify/test-session.json').read_text())['cookie']
PLACEHOLDER = '234XXXXXXXXXX'
NUMBER = '2348147632371'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


def rest(path, key_var):
    """Anon PostgREST read from .env.local; returns raw body."""
    env = {}
    for line in Path('.env.local').read_text().splitlines():
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    url, key = env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    out = subprocess.run(
        ['curl', '-s', '-H', f'apikey: {key}', '-H', f'Authorization: Bearer {key}', f'{url}{path}'],
        capture_output=True, text=True)
    return out.stdout


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    n, v = COOKIE.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': BASE}])
    pg = ctx.new_page()

    pg.goto(BASE + '/admin/settings', wait_until='networkidle')
    wa = pg.get_by_label('WhatsApp number (international digits)')
    wa.wait_for(state='visible', timeout=15000)
    for _ in range(50):
        if wa.input_value() == PLACEHOLDER:
            break
        pg.wait_for_timeout(200)
    ck('hydrated with placeholder', wa.input_value() == PLACEHOLDER, f'{wa.input_value()!r}')

    save_btn = pg.get_by_role('button', name='Save to drafts')
    ck('BASELINE: Save disabled with placeholder (bug reproduced)', save_btn.is_disabled())

    wa.fill(NUMBER)
    pg.wait_for_timeout(300)
    ck('FIX: Save enabled with 2348147632371 (validation cleared)', save_btn.is_enabled())
    ck('no validation error line',
       pg.get_by_text('Digits only', exact=False).count() == 0 and
       pg.get_by_text('looks off', exact=False).count() == 0)

    save_btn.click()
    pg.wait_for_timeout(600)
    ck('draft created (bar shows 1 unpublished change)',
       pg.get_by_text('1 unpublished change').count() > 0)

    pg.get_by_role('button', name='Publish', exact=True).first.click()
    dlg = pg.get_by_role('dialog')
    dlg.wait_for(state='visible', timeout=5000)
    dlg.get_by_role('button', name='Publish').click()
    # publish compiles + runs the txn + revalidate attempt: allow up to 12s
    cleared = False
    for _ in range(24):
        pg.wait_for_timeout(500)
        if pg.get_by_text('unpublished change').count() == 0:
            cleared = True
            break
    ck('draft bar cleared after publish (publish completed)', cleared)
    b.close()

# ---- live DB assertions (anon key, exactly how the storefront reads) ----
body = rest('/rest/v1/site_settings?key=eq.whatsappNumber&select=value', None)
ck('LIVE DB holds 2348147632371', json.loads(body)[0]['value'] == NUMBER, f'body={body.strip()}')

rows = json.loads(rest('/rest/v1/site_settings?select=key', None))
keys = [r['key'] for r in rows]
garbage = [k for k in keys if k.isdigit()]
ck('no digit-index garbage keys in site_settings', not garbage, f'garbage={garbage}')
# settingsToRows writes exactly 8 scalars + one object row per SEO page
# (SEO_PAGES = home, shop, blog, about, product, tracker) = 14.
ck('expected key set intact (14 rows: 8 scalars + 6 seo pages)',
   len(keys) == 14 and sum(1 for k in keys if k.startswith('seo.')) == 6,
   f'count={len(keys)} keys={sorted(keys)}')

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
