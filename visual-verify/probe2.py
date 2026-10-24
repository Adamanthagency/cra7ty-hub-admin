"""Step 4 probe: hint-text mystery, About spans, chunk gating, origin validation."""

import glob
import json
import os

from playwright.sync_api import sync_playwright

CUR = "http://localhost:3101"
LIVE = "https://www.cra7tyhub.com"
NEXT_DIR = r"C:\Users\ROG ZEPHYRUS\Projects\cra7ty-hub\.next\static\chunks"

INIT_PAYLOAD = {
    "page": "home",
    "values": {
        "home.hero.eyebrow": "HACKED_EYEBROW",
        "home.hero.headline.0": "HACKED_LINE",
    },
    "lists": {},
    "sections": {
        "page": "home",
        "order": ["faq", "hero", "categories", "featured", "marquee", "process", "bulk", "why", "testimonials"],
        "hidden": ["hero"],
        "variants": {},
    },
}


def bridge_chunk():
    for path in glob.glob(os.path.join(NEXT_DIR, "*.js")):
        with open(path, "rb") as fh:
            if b"set-sections" in fh.read():
                return os.path.basename(path)
    return None


PROBE_HINTS = """(needles) => {
  const out = {};
  for (const needle of needles) {
    const hits = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0 && el.textContent.includes(needle)) {
        const cs = getComputedStyle(el);
        hits.push({
          tag: el.tagName,
          cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 80),
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          inInnerText: document.body.innerText.includes(needle.toUpperCase()) || document.body.innerText.includes(needle),
        });
      }
    });
    out[needle] = hits;
  }
  out._bodyTextContent_has_fold = document.body.textContent.includes('Scroll to fold');
  out._bodyTextContent_has_drag = document.body.textContent.includes('Drag to rotate');
  return out;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    report = {}

    # 1. hint text: live vs current
    for label, url in (("live", LIVE + "/"), ("current", CUR + "/")):
        pg = ctx.new_page()
        try:
            pg.goto(url, wait_until="networkidle", timeout=45000)
            pg.wait_for_timeout(1500)
            report[f"hints_{label}"] = pg.evaluate(
                PROBE_HINTS, ["Scroll to fold", "Drag to rotate"]
            )
        except Exception as exc:
            report[f"hints_{label}"] = f"unreachable: {exc}".split("\n")[0]
        pg.close()

    # 2. About caption <p> outerHTML
    pa = ctx.new_page()
    pa.goto(CUR + "/about", wait_until="networkidle")
    report["about_caption_html"] = pa.evaluate(
        """() => {
          const ps = [...document.querySelectorAll('p')].filter((p) =>
            p.textContent.includes('One crane, folded in the studio'),
          );
          return ps.length ? ps[0].outerHTML.slice(0, 500) : 'NOT FOUND';
        }"""
    )
    pa.close()

    chunk = bridge_chunk()
    report["bridge_chunk"] = chunk

    # 3. chunk gating through the allowlisted embedder (3001)
    pe = ctx.new_page()
    reqs = []
    pe.on("request", lambda r: reqs.append(r.url))
    pe.goto("http://localhost:3001/", wait_until="networkidle")
    inner = pe.frames[1]
    inner.locator("body").first.wait_for(timeout=15000)
    pe.wait_for_timeout(1500)
    report["embed_3001_fetched_bridge_chunk"] = any(chunk and chunk in u for u in reqs)
    report["embed_3001_bridge_flag"] = inner.evaluate("() => typeof window.__cra7tyEditBridge")

    # 4a. wrong-origin synthetic message must be ignored
    inner.evaluate(
        """(payload) => {
          window.dispatchEvent(new MessageEvent('message', {
            data: { source: 'cra7ty', type: 'init', payload },
            origin: 'http://evil.example',
            source: window.parent,
          }));
        }""",
        INIT_PAYLOAD,
    )
    pe.wait_for_timeout(400)
    report["after_evil_origin"] = inner.evaluate(
        """() => ({
          eyebrow: document.querySelector('#hero-title')?.closest('section')?.querySelector('p.mono-label-xs')?.textContent.trim().slice(0, 50),
          first_section: document.querySelector('[data-cra7ty-section]')?.getAttribute('data-cra7ty-section'),
          hidden_sections: document.querySelectorAll('.cra7ty-section--hidden').length,
          hacked: document.body.innerText.includes('HACKED'),
        })"""
    )

    # 4b. control: the SAME message from an allowed origin must apply
    inner.evaluate(
        """(payload) => {
          window.dispatchEvent(new MessageEvent('message', {
            data: { source: 'cra7ty', type: 'init', payload },
            origin: 'http://localhost:3001',
            source: window.parent,
          }));
        }""",
        INIT_PAYLOAD,
    )
    pe.wait_for_timeout(400)
    report["after_allowed_origin_control"] = inner.evaluate(
        """() => ({
          eyebrow: document.querySelector('#hero-title')?.closest('section')?.querySelector('p.mono-label-xs')?.textContent.trim().slice(0, 50),
          first_section: document.querySelector('[data-cra7ty-section]')?.getAttribute('data-cra7ty-section'),
          hidden_sections: document.querySelectorAll('.cra7ty-section--hidden').length,
          hacked: document.body.innerText.includes('HACKED'),
        })"""
    )
    pe.close()

    print(json.dumps(report, indent=2))
    browser.close()
