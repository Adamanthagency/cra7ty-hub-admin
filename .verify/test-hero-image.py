"""Item 2 image-field E2E (real admin on 3999, real storefront on 3000).

Pass A — set images:
  1. Home > Hero > Edit > Choose from media > pick file > Save
  2. About > Hero > Edit > Choose from media > pick file > Save
  3. Publish once; draft bar clears
  4. Storefront / renders the hero photo; /about renders its photo
Pass B — remove both, publish, assert the art fallback is back.

Writes reported: content_values rows home.hero.art-image + about.hero.art-image.
"""
import sys
from playwright.sync_api import sync_playwright

ADMIN = 'http://127.0.0.1:3999'
STORE = 'http://127.0.0.1:3000'
ok = True


def ck(name, cond, detail=''):
    global ok
    print(('PASS' if cond else 'FAIL') + ': ' + name + (f' -- {detail}' if detail else ''))
    ok = ok and cond


def open_section(pg, page_path, row_text):
    """Open a page's section list, click Edit on the named row, wait for form."""
    pg.goto(f'{ADMIN}/admin/pages/{page_path}', wait_until='networkidle')
    row = pg.locator('li').filter(has_text=row_text).first
    row.get_by_role('button', name='Edit').click()
    pg.wait_for_timeout(400)


def pick_image(pg, field_label_start):
    """In the open SectionForm, set the image field via the media picker."""
    chooser = pg.get_by_role('button', name='Choose from media')
    ck(f'chooser visible for {field_label_start!r}', chooser.count() > 0, f'count={chooser.count()}')
    if chooser.count() == 0:
        return False
    chooser.first.click()
    # media picker panel opens (anchored by its search input); first file tile
    search = pg.get_by_label('Search media')
    search.wait_for(state='visible', timeout=8000)
    tile = search.locator('xpath=following-sibling::ul[1]/li[1]/button[1]')
    tile.wait_for(state='visible', timeout=8000)
    tile.click()
    pg.wait_for_timeout(300)
    # record the draft — the form only hands the change to the bar on Save
    save = pg.get_by_role('button', name='Save changes')
    ck(f'save enabled for {field_label_start!r}', save.is_enabled())
    save.click()
    # Save closes the panel after 400ms and the bar picks up the draft
    pg.wait_for_timeout(900)
    return pg.get_by_text('unpublished change').count() > 0


def remove_image(pg, field_label_start):
    rem = pg.get_by_role('button', name='Remove')
    if rem.count() > 0:
        rem.first.click()
        pg.wait_for_timeout(300)
        save = pg.get_by_role('button', name='Save changes')
        if save.count() > 0 and save.is_enabled():
            save.click()
            pg.wait_for_timeout(600)
        return True
    return False


def publish(pg):
    pub = pg.get_by_role('button', name='Publish', exact=True).first
    pub.click()
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
    import json
    from pathlib import Path
    cookie = json.loads(Path('.verify/test-session.json').read_text())['cookie']
    n, v = cookie.split(';', 1)[0].split('=', 1)
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()

    # --- Pass A: set both images ---
    open_section(pg, 'home', 'Hero')
    ck('home hero: image picker usable', pick_image(pg, 'Hero image'))

    open_section(pg, 'about', 'Hero')
    ck('about hero: image picker usable', pick_image(pg, 'About hero image'))

    ck('publish with both image drafts', publish(pg))

    # --- storefront assertions ---
    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    hero_img = pg.locator('#top img[class*="object-cover"]')
    ck('home hero renders the chosen photo', hero_img.count() > 0,
       f'count={hero_img.count()} src={(hero_img.first.get_attribute("src") or "")[:70] if hero_img.count() else ""}')

    pg.goto(STORE + '/about', wait_until='networkidle', timeout=60000)
    about_img = pg.locator('section img[class*="object-cover"]')
    ck('about hero renders the chosen photo', about_img.count() > 0,
       f'count={about_img.count()}')

    # --- Pass B: remove both, fallback must return ---
    open_section(pg, 'home', 'Hero')
    ck('home hero: remove works', remove_image(pg, 'Hero image'))
    open_section(pg, 'about', 'Hero')
    ck('about hero: remove works', remove_image(pg, 'About hero image'))
    ck('publish removals', publish(pg))

    pg.goto(STORE + '/', wait_until='networkidle', timeout=60000)
    ck('home fallback: no photo in hero', pg.locator('#top img[class*="object-cover"]').count() == 0)

    pg.goto(STORE + '/about', wait_until='networkidle', timeout=60000)
    ck('about fallback: no photo in hero', pg.locator('section img[class*="object-cover"]').count() == 0)

    b.close()

print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
