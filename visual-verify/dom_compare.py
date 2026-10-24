"""Step 4: byte-identical DOM check (normal visit, no edit mode).

Baseline = pre-edit snapshot (cra7ty-hub.zip, Oct 4) served on 3200.
Current  = today's build served on 3101.
Scripts are stripped (RSC payload and analytics legitimately differ);
everything else in <body> must match, and the current DOM must contain
zero edit-mode artifacts.
"""

import json
import re

from playwright.sync_api import sync_playwright

ROUTES = [
    "/",
    "/shop",
    "/blog",
    "/about",
    "/products/origami-crane-single",
]
BASE = "http://localhost:3200"
CUR = "http://localhost:3101"


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


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    results = {}
    for route in ROUTES:
        pb = ctx.new_page()
        pc = ctx.new_page()
        pb.goto(BASE + route, wait_until="networkidle")
        pc.goto(CUR + route, wait_until="networkidle")
        pc.wait_for_timeout(400)  # let client effects (consent card) mount
        db, dc = norm(dom(pb)), norm(dom(pc))
        artifacts = pc.evaluate(
            """() => ({
              keyed: document.querySelectorAll('[data-cra7ty-key]').length,
              sections: document.querySelectorAll('[data-cra7ty-section]').length,
              classes: document.querySelectorAll('.cra7ty-section, .cra7ty-editable').length,
              bridgeFlag: typeof window.__cra7tyEditBridge,
            })"""
        )
        entry = {
            "identical": db == dc,
            "artifacts": artifacts,
            "len_baseline": len(db),
            "len_current": len(dc),
        }
        if db != dc:
            i = 0
            while i < min(len(db), len(dc)) and db[i] == dc[i]:
                i += 1
            entry["first_diff_at"] = i
            entry["baseline_ctx"] = db[max(0, i - 150) : i + 250]
            entry["current_ctx"] = dc[max(0, i - 150) : i + 250]
        results[route] = entry
        pb.close()
        pc.close()
    print(json.dumps(results, indent=2))
    browser.close()
