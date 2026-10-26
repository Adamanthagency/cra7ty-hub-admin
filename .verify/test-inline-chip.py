"""Inline-chip fix check (pages/[page] row chips record a `section` draft).

Against the running admin dev server + saved session:
  1. /admin/pages/global loads with NO draft bar.
  2. Clicking the row's Paystack+whatsapp Layout chip records a draft:
     bar appears with "1 unpublished change" + Publish button, the chip
     shows the UNPUBLISHED choice as pressed, and the page subtitle
     counts the draft.
  3. Discard (confirm dialog) clears it — local only, nothing published.

Writes: NONE (Discard never writes; Publish is never clicked).
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3999'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()

    pg.goto(f'{ADMIN}/admin/pages/global', wait_until='networkidle')
    ck('on the Site-wide page', 'Site-wide' in pg.content())
    ck('no draft bar initially', pg.get_by_text('unpublished change').count() == 0)
    ck('Publish absent initially', pg.get_by_role('button', name='Publish', exact=True).count() == 0)

    chip = pg.get_by_role('group', name='Layout').get_by_role(
        'button', name='paystack+whatsapp', exact=True)
    ck('row chip renders', chip.count() == 1)
    ck('chip starts unpressed', chip.get_attribute('aria-pressed') == 'false')

    chip.click()
    pg.wait_for_timeout(400)

    ck('draft bar appears', pg.get_by_text('1 unpublished change').count() == 1)
    ck('Publish button appears', pg.get_by_role('button', name='Publish', exact=True).count() == 1)
    ck('chip now pressed (draft overlay)', chip.get_attribute('aria-pressed') == 'true')
    ck('header counts the draft', '1 unpublished' in pg.content())

    # Discard — local-only per DraftBar code ("Discard is local and never writes")
    pg.get_by_role('button', name='Discard', exact=True).click()
    dlg = pg.get_by_role('dialog')
    dlg.wait_for(state='visible', timeout=5000)
    dlg.get_by_role('button', name='Discard changes').click()
    pg.wait_for_timeout(400)
    ck('bar gone after discard', pg.get_by_text('unpublished change').count() == 0)
    ck('chip back to whatsapp', chip.get_attribute('aria-pressed') == 'false')
    ck('discard note shown', pg.get_by_text('Drafts discarded').count() == 1)

    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
