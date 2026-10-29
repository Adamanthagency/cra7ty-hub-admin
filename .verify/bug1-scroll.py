"""Bug 1 deep-dive: scroll the Hero edit panel to the bottom and screenshot,
so we can see exactly where "Hero slideshow" sits and whether it renders."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ADMIN = 'http://localhost:52710'
cookie = json.loads(Path('.verify/test-session-local.json').read_text())['cookie']
n, v = cookie.split(';', 1)[0].split('=', 1)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_cookies([{'name': n.strip(), 'value': v, 'url': ADMIN}])
    pg = ctx.new_page()
    pg.goto(f'{ADMIN}/admin/pages/home', wait_until='networkidle')
    pg.locator('li').filter(has_text='Hero').first.get_by_role('button', name='Edit').click()
    pg.wait_for_selector('text=Hero slideshow', timeout=15000)

    # scroll the slide-over's scroll container (overflow-y-auto) to the bottom
    scrolled = pg.evaluate("""() => {
      const panels = [...document.querySelectorAll('[role=dialog] div')].filter(d => d.scrollHeight > d.clientHeight + 20);
      const el = panels.sort((a,b)=>b.scrollHeight-a.scrollHeight)[0];
      if (!el) return null;
      el.scrollTop = el.scrollHeight;
      return {sh: el.scrollHeight, ch: el.clientHeight, top: el.scrollTop};
    }""")
    print('scroll container:', scrolled)
    pg.wait_for_timeout(500)
    pg.screenshot(path='.verify/bug1-hero-bottom.png')

    # where does the slideshow label sit inside the panel now?
    box = pg.get_by_text('Hero slideshow', exact=False).first.bounding_box()
    print('slideshow label box:', box)

    # count the blocks above it: how many fields precede the list
    n_fields = pg.locator('[role=dialog] input, [role=dialog] textarea').count()
    print('inputs in panel:', n_fields)
    b.close()
