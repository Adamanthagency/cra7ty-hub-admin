"""About-hero variant check: split (default) → stacked → back to split."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
STORE = 'http://127.0.0.1:3000'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


def set_variant(pg, row_text, new_value):
    pg.goto(f'{ADMIN}/admin/pages/about', wait_until='networkidle')
    row = pg.locator('li').filter(has_text=row_text).first
    row.get_by_role('button', name='Edit').click()
    pg.wait_for_timeout(400)
    group = pg.get_by_role('group', name='Layout').last
    group.wait_for(state='visible', timeout=5000)
    group.get_by_role('button', name=new_value, exact=True).click()
    pg.wait_for_timeout(200)
    save = pg.get_by_role('button', name='Save changes')
    if save.is_enabled():
        save.click()
        pg.wait_for_timeout(700)
        return True
    pg.keyboard.press('Escape')
    return False


def publish(pg):
    pg.goto(f'{ADMIN}/admin/pages/about', wait_until='networkidle')
    pub = pg.get_by_role('button', name='Publish', exact=True)
    if pub.count() == 0:
        return True
    pub.first.click()
    dlg = pg.get_by_role('dialog')
    dlg.wait_for(state='visible', timeout=5000)
    dlg.get_by_role('button', name='Publish').click()
    for _ in range(30):
        pg.wait_for_timeout(500)
        if pg.get_by_text('unpublished change').count() == 0:
            return True
    return False


def probe(pg):
    pg.goto(STORE + '/about', wait_until='networkidle', timeout=60000)
    return pg.evaluate('''() => {
      const section = document.querySelector('section');
      const grid = section ? section.querySelector('.grid') : null;
      const cols = grid ? Array.from(grid.children).map(c => c.className) : [];
      return {
        splitArt: cols.filter(c => c.includes('lg:col-span-5')).length,
        stackedOnly: cols.filter(c => c === 'col-span-12').length,
      };
    }''')


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()

    base = probe(pg)
    ck('baseline about-hero split', base['splitArt'] == 1 and base['stackedOnly'] == 0, json.dumps(base))

    ck('set stacked', set_variant(pg, 'Hero and marquee', 'stacked'))
    ck('publish', publish(pg))
    after = probe(pg)
    ck('about-hero now STACKED', after['splitArt'] == 0 and after['stackedOnly'] >= 1, json.dumps(after))

    ck('revert to split', set_variant(pg, 'Hero and marquee', 'split'))
    ck('publish revert', publish(pg))
    back = probe(pg)
    ck('about-hero back to split', back['splitArt'] == 1 and back['stackedOnly'] == 0, json.dumps(back))

    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
