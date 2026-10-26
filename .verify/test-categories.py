"""Item 1 dynamic-categories E2E (real admin 3999, real storefront 3000).

Pass A: add a 7th category (slug id + name + blurb) through the admin,
        publish once, assert the storefront home renders 7 rows with
        renumbered 01–07 indices and /shop gains the new tab.
Pass B: remove the 7th row, publish, assert everything is back to six.

Writes reported: categories table rows added + deleted (2 publishes),
net zero — six original rows untouched by the end.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
STORE = 'http://127.0.0.1:3000'
NEW_ID = 'wedding-favours'
NEW_NAME = 'Wedding favours'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


def row_count(pg):
    """Category rows on the admin manager (li cards in the list)."""
    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle')
    pg.wait_for_timeout(800)  # live content fetch + adopt effect
    return pg.locator('ul.space-y-3 > li').count()


def home_rows(pg):
    """Home-page category rows: each is a button with aria-expanded."""
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    return pg.evaluate('''() => {
      const section = document.querySelector('#categories');
      if (!section) return { rows: -1, indices: [], names: [], sticky: 0, error: true };
      const rows = [...section.querySelectorAll('button[aria-expanded]')];
      return {
        rows: rows.length,
        indices: rows.map(r => (r.querySelector('span') || {}).textContent?.trim() || ''),
        names: rows.map(r => r.querySelectorAll('span')[1]?.textContent?.trim().split('\\n')[0] || ''),
        sticky: section.querySelectorAll('[class*="lg:sticky"]').length,
        error: false,
      };
    }''')


def shop_tab(pg, name):
    pg.goto(STORE + '/shop', wait_until='networkidle', timeout=60000)
    return pg.get_by_role('button', name=name, exact=False).count()


def publish(pg):
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    pub = pg.get_by_role('button', name='Publish', exact=True)
    if pub.count() == 0:
        return True  # nothing to publish
    pub.first.click()
    dlg = pg.get_by_role('dialog')
    dlg.wait_for(state='visible', timeout=5000)
    dlg.get_by_role('button', name='Publish').click()
    for _ in range(30):
        pg.wait_for_timeout(500)
        if pg.get_by_text('unpublished change').count() == 0:
            return True
    return False


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()
    console_errors = []
    pg.on('pageerror', lambda e: console_errors.append(f'{pg.url} :: {str(e)[:200]}'))
    pg.on('console', lambda m: console_errors.append(f'{pg.url} :: console {m.type}: {m.text[:200]}')
          if m.type == 'error' else None)

    # --- baseline ---
    admin_rows = row_count(pg)
    ck('admin starts with 6 rows', admin_rows == 6, f'rows={admin_rows}')

    base = home_rows(pg)
    ck('storefront starts with 6 rows, 01–06, sticky viewer intact',
       base['rows'] == 6 and base['indices'] == ['01', '02', '03', '04', '05', '06']
       and base['sticky'] > 0,
       json.dumps(base))
    ck('baseline has no wedding tab', shop_tab(pg, NEW_NAME) == 0)

    # --- Pass A: add the 7th category ---
    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle')
    pg.get_by_label('New id (slug)').fill(NEW_ID)
    add = pg.get_by_role('button', name='Add category')
    ck('Add button enables for a valid slug', add.is_enabled())
    add.click()
    pg.wait_for_timeout(300)

    new_row = pg.locator('ul.space-y-3 > li').filter(has_text=NEW_ID)
    ck('new row appears in the list', new_row.count() == 1, f'rows={pg.locator("ul.space-y-3 > li").count()}')
    new_row.get_by_label('Name').fill(NEW_NAME)
    new_row.get_by_label('Blurb').fill('Favours folded, banded and counted for the head table.')
    pg.wait_for_timeout(200)

    save = pg.get_by_role('button', name='Save to drafts')
    ck('Save enables once name+blurb are filled', save.is_enabled())
    save.click()
    pg.wait_for_timeout(400)
    ck('draft recorded', pg.get_by_text('Saved to drafts').count() > 0)

    ck('publish 7th category', publish(pg))

    after = home_rows(pg)
    ck('storefront now renders 7 rows',
       after['rows'] == 7, json.dumps(after))
    ck('indices renumbered 01–07',
       after['indices'] == ['01', '02', '03', '04', '05', '06', '07'],
       json.dumps(after['indices']))
    ck('new category name renders live',
       any(NEW_NAME in n for n in after['names']), json.dumps(after['names']))
    ck('sticky viewer column still present (no layout breakage)',
       after['sticky'] > 0 and not after['error'])
    ck('no page JS errors on home', len(console_errors) == 0, str(console_errors[:2]))
    ck('shop gains the new tab', shop_tab(pg, NEW_NAME) == 1)

    # --- Pass B: remove it again (restore) ---
    pg.goto(f'{ADMIN}/admin/categories', wait_until='networkidle')
    pg.wait_for_timeout(800)  # live content fetch + adopt effect
    remove = pg.get_by_role('button', name=f'Remove {NEW_ID} category')
    remove.wait_for(state='visible', timeout=15000)
    ck('remove button present', remove.count() == 1)
    remove.click()
    pg.wait_for_timeout(300)
    ck('row gone from the list',
       pg.locator('ul.space-y-3 > li').filter(has_text=NEW_ID).count() == 0)
    save = pg.get_by_role('button', name='Save to drafts')
    ck('Save enables after removal', save.is_enabled())
    save.click()
    pg.wait_for_timeout(400)
    ck('removal recorded as draft', pg.get_by_text('Saved to drafts').count() > 0)
    ck('publish removal', publish(pg))

    back = home_rows(pg)
    ck('storefront back to 6 rows with original indices',
       back['rows'] == 6 and back['indices'] == ['01', '02', '03', '04', '05', '06'],
       json.dumps(back))
    ck('shop tab gone', shop_tab(pg, NEW_NAME) == 0)

    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
