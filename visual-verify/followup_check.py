"""Step 4 follow-up: visible text vs live, chunk gating, wrong-origin test.

Runs against:
  current build  http://localhost:3101
  live site      https://www.cra7tyhub.com
  evil parent    http://localhost:4174  (non-allowlisted origin)
"""

import glob
import json
import os
import re

from playwright.sync_api import sync_playwright

ROUTES = ["/", "/shop", "/blog", "/about", "/products/origami-crane-single"]
CUR = "http://localhost:3101"
LIVE = "https://www.cra7tyhub.com"
NEXT_DIR = r"C:\Users\ROG ZEPHYRUS\Projects\cra7ty-hub\.next\static\chunks"


def bridge_chunk():
    for path in glob.glob(os.path.join(NEXT_DIR, "*.js")):
        with open(path, "rb") as fh:
            if b"set-sections" in fh.read():
                return os.path.basename(path)
    return None


def visible_text(page):
    return page.evaluate(
        """() => document.body.innerText.replace(/\\s+/g, ' ').trim()"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    report = {}

    # 1. visible-text equality vs live
    text_diffs = {}
    for route in ROUTES:
        pl = ctx.new_page()
        pc = ctx.new_page()
        pl.goto(LIVE + route, wait_until="load", timeout=45000)
        pc.goto(CUR + route, wait_until="networkidle")
        pc.wait_for_timeout(300)
        tl, tc = visible_text(pl), visible_text(pc)
        if tl != tc:
            sm_chars = []
            import difflib

            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(
                None, tl, tc, autojunk=False
            ).get_opcodes():
                if tag != "equal":
                    sm_chars.append(
                        {"op": tag, "live": tl[i1:i2], "current": tc[j1:j2]}
                    )
            text_diffs[route] = sm_chars[:20]
        pl.close()
        pc.close()
    report["visible_text_diffs_vs_live"] = text_diffs or "NONE on any route"

    # 2. AboutHero spans restored (flex children present again)
    pa = ctx.new_page()
    pa.goto(CUR + "/about", wait_until="networkidle")
    report["about_caption_spans"] = pa.evaluate(
        """() => {
          const p = document.querySelector('p.mono-label-xs.mt-1.flex');
          return p ? p.querySelectorAll(':scope > span').length : 'caption <p> not found';
        }"""
    )
    pa.close()

    chunk = bridge_chunk()
    report["bridge_chunk"] = chunk

    # 3. chunk gating: normal visit must NOT fetch the bridge chunk
    pn = ctx.new_page()
    resources = []
    pn.on("request", lambda r: resources.append(r.url))
    pn.goto(CUR + "/", wait_until="networkidle")
    pn.wait_for_timeout(500)
    report["normal_visit_fetched_bridge_chunk"] = any(
        chunk and chunk in url for url in resources
    )
    report["normal_visit_bridge_flag"] = pn.evaluate(
        "() => typeof window.__cra7tyEditBridge"
    )
    pn.close()

    # 4. framed edit mode DOES fetch it, and the evil parent's init is ignored
    pe = ctx.new_page()
    pe.goto("http://localhost:4174/", wait_until="networkidle")
    frame = pe.frame_locator("#f")
    frame.locator("body").first.wait_for(timeout=15000)
    pe.wait_for_timeout(2500)  # evil init spammed every 500ms
    inner = pe.frames[1]
    frame_resources = inner.evaluate(
        "() => performance.getEntriesByType('resource').map((r) => r.name)"
    )
    report["edit_iframe_fetched_bridge_chunk"] = any(
        chunk and chunk in url for url in frame_resources
    )
    report["edit_iframe_bridge_flag"] = inner.evaluate(
        "() => typeof window.__cra7tyEditBridge"
    )
    report["wrong_origin_ignored"] = inner.evaluate(
        """() => {
          const eyebrow = document.querySelector('#hero-title')?.closest('section')?.querySelector('p');
          const firstSection = document.querySelector('[data-cra7ty-section]');
          return {
            eyebrow_text: eyebrow ? eyebrow.textContent.trim().slice(0, 60) : null,
            eyebrow_is_hacked: document.body.innerText.includes('HACKED'),
            first_section: firstSection ? firstSection.getAttribute('data-cra7ty-section') : null,
            any_hidden_class: document.querySelectorAll('.cra7ty-section--hidden').length,
          };
        }"""
    )
    pe.close()

    print(json.dumps(report, indent=2))
    browser.close()
