"""Step 4 (full triage version): every DOM difference, hunk by hunk.

Baselines:
  - https://www.cra7tyhub.com  — the shipped pre-edit production site
  - http://localhost:3200      — Oct 4 zip snapshot (covers only / and /products/*)
Current: http://localhost:3101 (today's build, normal visit)

Scripts are stripped from <body> before comparison (RSC payload and
analytics bootstrapping legitimately differ). Every differing hunk is
printed so each can be triaged as pre-existing drift vs edit layer.
"""

import difflib
import json
import re

from playwright.sync_api import sync_playwright

ROUTES = ["/", "/shop", "/blog", "/about", "/products/origami-crane-single"]
LIVE = "https://www.cra7tyhub.com"
CUR = "http://localhost:3101"
ZIPBASE = "http://localhost:3200"
ZIP_ROUTES = {"/", "/products/origami-crane-single"}


def dom(page):
    return page.evaluate(
        """() => {
          const c = document.body.cloneNode(true);
          c.querySelectorAll('script').forEach((s) => s.remove());
          return c.innerHTML;
        }"""
    )


def norm(html):
    return re.sub(r">\s+<", "><", html).strip()


def hunks(a, b):
    """Split both strings into tag-level tokens and diff those."""
    ta = re.split(r"(?=<)", a)
    tb = re.split(r"(?=<)", b)
    out = []
    sm = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        out.append(
            {
                "op": tag,
                "baseline": "".join(ta[i1:i2])[:300],
                "current": "".join(tb[j1:j2])[:300],
            }
        )
    return out


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    report = {}
    for route in ROUTES:
        pl = ctx.new_page()
        pc = ctx.new_page()
        try:
            pl.goto(LIVE + route, wait_until="networkidle", timeout=45000)
        except Exception as exc:  # live can be slow; retry once with load
            pl.goto(LIVE + route, wait_until="load", timeout=45000)
        pc.goto(CUR + route, wait_until="networkidle")
        pc.wait_for_timeout(400)
        dl, dc = norm(dom(pl)), norm(dom(pc))
        entry = {"identical_to_live": dl == dc, "hunks_live": hunks(dl, dc)}
        if route in ZIP_ROUTES:
            pz = ctx.new_page()
            pz.goto(ZIPBASE + route, wait_until="networkidle")
            dz = norm(dom(pz))
            entry["identical_to_zip"] = dz == dc
            entry["hunks_zip"] = hunks(dz, dc)
            pz.close()
        report[route] = entry
        pl.close()
        pc.close()
    print(json.dumps(report, indent=2)[:15000])
    browser.close()
