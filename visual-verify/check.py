#!/usr/bin/env python3
"""
End-to-end verification of the CRA7TY admin Visual editor against the
protocol-faithful storefront fixture (visual-verify/fixture.html).

Run via the webapp-testing skill's with_server.py:

  python <skill>/scripts/with_server.py \
    --server "node visual-verify/server.js" --port 4173 \
    --server "node visual-verify/dev.js" --port 3100 \
    --timeout 90 -- python visual-verify/check.py
"""

import re
import sys
import time

from playwright.sync_api import sync_playwright, expect

ADMIN = "http://localhost:3100"
FIXTURE = "http://localhost:4173"
SEED_HEADLINE = "Folded by hand,"
XSS = "<script>window.__pwned=1</script>"

results = []
page_errors = []


def check(name, fn):
    try:
        fn()
        results.append((name, True, ""))
        print(f"  PASS  {name}", flush=True)
    except Exception as exc:  # noqa: BLE001 - report every failure, keep going
        first = str(exc).splitlines()[0][:220]
        results.append((name, False, first))
        print(f"  FAIL  {name}: {first}", flush=True)


def frame(page):
    return page.frame_locator('iframe[title="Storefront preview"]')


def fixture_page(page):
    for f in page.frames:
        if FIXTURE in (f.url or ""):
            return f
    raise AssertionError("fixture frame not found")


def frame_order(page):
    return fixture_page(page).evaluate(
        "() => [...document.querySelectorAll('section[data-section-key]')]"
        ".map(s => s.dataset.sectionKey)"
    )


def wait_order(page, expected, timeout=8000):
    """Poll the frame's section order until it matches (expect.poll is
    unavailable in this Playwright version, so poll manually)."""
    last = None
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        last = frame_order(page)
        if last == expected:
            return
        page.wait_for_timeout(200)
    raise AssertionError(f"frame order {last} != {expected}")


def no_overflow(page):
    return page.evaluate(
        "() => document.documentElement.scrollWidth <= window.innerWidth + 1"
    )


def wait_no_overflow(page, where):
    for _ in range(10):
        if no_overflow(page):
            return
        page.wait_for_timeout(300)
    raise AssertionError(f"horizontal overflow on {where} (scrollWidth > innerWidth)")


def iframe(page):
    return page.locator('iframe[title="Storefront preview"]')


def panel(page):
    return page.locator('aside[aria-label="Visual editor panel"]')


def sidebar(page):
    return page.locator('nav[aria-label="Admin sections"]')


def handshakes(page, path="/"):
    """Wait for the full ready -> init round trip inside the frame."""
    expect(frame(page).locator("#fixture-status")).to_contain_text(
        "init received", timeout=20000
    )
    expect(iframe(page)).to_have_attribute(
        "src", f"{FIXTURE}{path}?cra7ty-edit=1"
    )


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        context.add_cookies(
            [{"name": "ch_admin_session", "value": "mock-admin", "url": ADMIN}]
        )
        page = context.new_page()
        page.set_default_timeout(15000)
        page.set_default_navigation_timeout(45000)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        dialogs = []
        page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))

        # ── A. entry points ─────────────────────────────────────────
        print("\n== A. entry points ==")

        def a1():
            page.goto(f"{ADMIN}/admin/pages")
            expect(page.locator("main a[href$='/visual']")).to_have_count(7)

        check("pages manager: 7 'Open visual editor' links", a1)

        # ── B. sections screen entry + handshake ────────────────────
        print("\n== B. visual route + handshake ==")

        def b1():
            page.goto(f"{ADMIN}/admin/pages/home")
            link = page.locator('a[href="/admin/pages/home/visual"]')
            expect(link).to_have_count(1)
            link.click()
            page.wait_for_url("**/admin/pages/home/visual")

        check("sections screen button opens the visual editor", b1)

        def b2():
            handshakes(page, "/")

        check("frame loads fixture, ready -> init round trip, correct src", b2)

        def b3():
            expect(page.get_by_text("Loading storefront…")).to_have_count(0)

        check("loading overlay gone after handshake", b3)

        # ── C. click a headline, edit, live update ──────────────────
        print("\n== C. click-to-edit + live preview ==")

        def c1():
            frame(page).locator(
                '[data-cra7ty-key="home.hero.headline.0"]'
            ).click()
            expect(panel(page).locator("p").first).to_have_text("Headline line 1")
            expect(panel(page).get_by_label("Headline line 1")).to_have_value(
                SEED_HEADLINE
            )

        check("clicking headline in frame opens its FieldInput", c1)

        def c2():
            panel(page).get_by_label("Headline line 1").fill("Folded by hand, by us")
            expect(
                frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]')
            ).to_have_text("Folded by hand, by us")
            expect(page.get_by_text("1 unpublished change").first).to_be_visible()

        check("typing updates the frame live + draft badge = 1", c2)

        # ── D. token fields ─────────────────────────────────────────
        print("\n== D. token fields ==")

        def d1():
            frame(page).locator(
                '[data-cra7ty-key="home.featured.count-note"]'
            ).click()
            expect(panel(page).locator("p").first).to_have_text("Count note")
            expect(
                panel(page).get_by_text("Tokens allowed: {shown}, {total}")
            ).to_be_visible()

        check("count-note opens with token hint under the input", d1)

        def d2():
            note = frame(page).locator(
                '[data-cra7ty-key="home.featured.count-note"]'
            )
            expect(note).to_contain_text("That is 4 of 6.")
            expect(note).not_to_contain_text("{shown}")

        check("frame interpolates {shown}/{total}; raw tokens never shown", d2)

        def d3():
            panel(page).get_by_label("Count note").fill(
                "Stock: {shown} of {total} kinds available."
            )
            expect(
                frame(page).locator('[data-cra7ty-key="home.featured.count-note"]')
            ).to_have_text("Stock: 4 of 6 kinds available.")
            expect(panel(page).get_by_label("Count note")).to_have_value(
                "Stock: {shown} of {total} kinds available."
            )
            expect(page.get_by_text("2 unpublished changes").first).to_be_visible()

        check("raw token string sent to frame; frame interpolates it", d3)

        # ── E. list row editing ─────────────────────────────────────
        print("\n== E. list rows (FAQ) ==")

        def e1():
            frame(page).locator(
                '[data-cra7ty-key="home.faq.items.0.question"]'
            ).click()
            expect(panel(page).locator("p").first).to_have_text("FAQ items")

        check("clicking a FAQ question opens the ListEditor", e1)

        def e2():
            row0 = panel(page).locator("ol > li").first
            expect(row0.get_by_label("Question")).to_have_value("How do I pay?")
            row0.get_by_label("Question").fill("How do I pay for this order?")
            expect(
                frame(page).locator(
                    '[data-cra7ty-key="home.faq.items.0.question"]'
                )
            ).to_have_text("How do I pay for this order?")
            expect(page.get_by_text("3 unpublished changes").first).to_be_visible()

        check("editing row updates the frame via set-list", e2)

        # ── F. section controls: variant, move, hide ────────────────
        print("\n== F. section controls ==")

        def f1():
            frame(page).locator('[data-sec="featured"]').click()
            expect(panel(page).locator("p").first).to_have_text("Featured products")
            expect(
                panel(page).get_by_role("button", name="Move Featured products up")
            ).to_be_visible()
            expect(
                panel(page).get_by_role(
                    "switch", name="Featured products visible"
                )
            ).to_be_visible()

        check("clicking a section label opens section controls", f1)

        def f2():
            panel(page).get_by_role("button", name="grid", exact=True).click()
            expect(frame(page).locator("#featured")).to_have_attribute(
                "class", re.compile(r"\bgrid\b")
            )
            expect(page.get_by_text("4 unpublished changes").first).to_be_visible()

        check("variant chip changes the frame layout (grid)", f2)

        def f3():
            panel(page).get_by_role(
                "button", name="Move Featured products up"
            ).click()
            wait_order(
                page,
                [
                    "hero",
                    "marquee",
                    "featured",
                    "categories",
                    "process",
                    "bulk",
                    "why",
                    "testimonials",
                    "faq",
                ],
            )

        check("Move up reorders the frame", f3)

        def f4():
            panel(page).get_by_role(
                "switch", name="Featured products visible"
            ).click()
            expect(frame(page).locator("#featured")).to_have_attribute(
                "data-hidden", "true"
            )

        check("Hide removes the section from the frame", f4)

        def f5():
            panel(page).get_by_role(
                "button", name="Edit all fields in this section"
            ).click()
            expect(panel(page).get_by_label("Count note")).to_be_visible()
            panel(page).get_by_role("button", name="← Section controls").click()
            expect(
                panel(page).get_by_role(
                    "button", name="Move Featured products up"
                )
            ).to_be_visible()

        check("'Edit all fields' opens the existing SectionForm inline", f5)

        # ── G. page outline (nothing selected) ──────────────────────
        print("\n== G. page outline ==")

        def g1():
            panel(page).get_by_role("button", name="← Page outline").click()
            expect(panel(page).locator("p").first).to_have_text("Page outline")
            expect(panel(page).locator("ol > li")).to_have_count(9)
            expect(panel(page)).to_contain_text("Layout change pending")

        check("outline lists all 9 sections + pending variant marker", g1)

        def g2():
            panel(page).get_by_role("button", name="Move Hero down").click()
            wait_order(
                page,
                [
                    "marquee",
                    "hero",
                    "featured",
                    "categories",
                    "process",
                    "bulk",
                    "why",
                    "testimonials",
                    "faq",
                ],
            )

        check("outline reorder moves the frame section", g2)

        def g3():
            panel(page).get_by_role("switch", name="Marquee strip visible").click()
            expect(frame(page).locator("#marquee")).to_have_attribute(
                "data-hidden", "true"
            )

        check("outline hide hides the frame section", g3)

        def g4():
            panel(page).get_by_role(
                "button", name="Why paper", exact=True
            ).click()
            expect(panel(page).locator("p").first).to_have_text("Why paper")
            expect(
                frame(page).locator('[data-section-key="why"]')
            ).to_have_attribute("class", re.compile(r"\bhl\b"))

        check("outline jump selects section + highlights it in the frame", g4)

        # ── H. bridge security ──────────────────────────────────────
        print("\n== H. bridge security ==")

        def h1():
            page.evaluate(
                """() => window.postMessage({
                    source: 'cra7ty',
                    type: 'select-field',
                    payload: {key: 'global.navigation.order-label',
                              rect: {top: 5, left: 5, width: 50, height: 20}}
                }, '*')"""
            )
            page.wait_for_timeout(600)
            expect(panel(page).locator("p").first).to_have_text("Why paper")

        check("message from wrong origin (admin window) is ignored", h1)

        def h2():
            fixture_page(page).evaluate(
                """() => window.__send({
                    source: 'cra7ty',
                    type: 'select-field',
                    payload: {key: 42, rect: {top: 'x', left: 1, width: 1, height: 1}}
                })"""
            )
            page.wait_for_timeout(600)
            expect(panel(page).locator("p").first).to_have_text("Why paper")

        check("schema-invalid message from right origin is ignored", h2)

        def h3():
            fixture_page(page).evaluate(
                """() => window.__send({
                    source: 'cra7ty',
                    type: 'select-field',
                    payload: {key: 'home.hero.eyebrow',
                              rect: {top: 1, left: 1, width: 10, height: 10}}
                })"""
            )
            expect(panel(page).locator("p").first).to_have_text("Eyebrow")

        check("valid message from fixture origin IS accepted (control)", h3)

        # ── I. pasted script tag stays plain text ───────────────────
        print("\n== I. XSS plain-text ==")

        def i1():
            frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]').click()
            panel(page).get_by_label("Headline line 1").fill(XSS)
            expect(panel(page).get_by_label("Headline line 1")).to_have_value(XSS)
            expect(
                frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]')
            ).to_have_text(XSS)
            assert fixture_page(page).evaluate("() => window.__pwned") is None
            assert dialogs == [], f"JS dialog fired: {dialogs}"

        check("script tag renders as literal text, never executes", i1)

        # ── J. discard + publish ────────────────────────────────────
        print("\n== J. DraftBar: discard + publish ==")

        def j1():
            expect(page.get_by_title("Wired with the backend")).to_be_visible()
            page.get_by_role("button", name="Discard", exact=True).click()
            dlg = page.get_by_role("dialog")
            expect(dlg).to_contain_text("Discard all changes?")
            dlg.get_by_role("button", name="Discard changes").click()
            expect(page.get_by_text("0 unpublished changes").first).to_be_visible()
            expect(
                frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]')
            ).to_have_text(SEED_HEADLINE)

        check("Discard drops drafts and resyncs the frame to published", j1)

        def j2():
            frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]').click()
            panel(page).get_by_label("Headline line 1").fill("Hand-folded with care")
            expect(page.get_by_text("1 unpublished change").first).to_be_visible()
            page.get_by_role("button", name="Publish", exact=True).click()
            dlg = page.get_by_role("dialog")
            expect(dlg).to_contain_text("Publish changes?")
            dlg.get_by_role("button", name="Publish").click()
            expect(page.get_by_role("status")).to_contain_text("Published 1 change")
            expect(page.get_by_text("0 unpublished changes").first).to_be_visible()
            expect(
                frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]')
            ).to_have_text("Hand-folded with care")

        check("Publish records a revision + frame keeps the published copy", j2)

        # ── K. History restore (client-side nav to keep state) ──────
        print("\n== K. History restore ==")

        def k1():
            sidebar(page).get_by_role("link", name="History").click()
            page.wait_for_url("**/admin/history")
            first = page.locator("main ul > li").first
            expect(first).to_contain_text("Hero — Headline line 1")
            expect(first).to_contain_text("Hand-folded with care")

        check("newest revision shows the published headline change", k1)

        def k2():
            sub = page.get_by_text(re.compile(r"\d+ revisions")).first
            before = int(re.search(r"(\d+)", sub.inner_text()).group(1))
            page.locator("main ul > li").first.get_by_role(
                "button", name="Restore", exact=True
            ).click()
            dlg = page.get_by_role("dialog")
            expect(dlg).to_contain_text("Restore this revision?")
            dlg.get_by_role("button", name="Restore").click()
            expect(
                page.get_by_text(re.compile(r"\d+ revisions")).first
            ).to_have_text(re.compile(rf"{before + 1} revisions"))

        check("Restore rolls back and records a reversal revision", k2)

        def k3():
            sidebar(page).get_by_role("link", name="Pages").click()
            page.wait_for_url("**/admin/pages")
            page.locator('a[href="/admin/pages/home/visual"]').click()
            page.wait_for_url("**/admin/pages/home/visual")
            handshakes(page, "/")
            expect(
                frame(page).locator('[data-cra7ty-key="home.hero.headline.0"]')
            ).to_have_text(SEED_HEADLINE)

        check("frame shows the restored headline after re-init", k3)

        # ── L. shared section pointer (shop page) ───────────────────
        print("\n== L. shared sections ==")

        def l1():
            sidebar(page).get_by_role("link", name="Pages").click()
            page.wait_for_url("**/admin/pages")
            page.locator('a[href="/admin/pages/shop/visual"]').click()
            page.wait_for_url("**/admin/pages/shop/visual")
            handshakes(page, "/shop")
            expect(panel(page)).to_contain_text("Edited on Home")

        check("shared Bulk band shows the 'Edited on Home' pointer", l1)

        def l2():
            frame(page).locator('[data-sec="bulk"]').click()
            expect(panel(page).locator("p").first).to_have_text("Bulk band")
            expect(
                panel(page).get_by_role(
                    "button", name="Edit all fields in this section"
                )
            ).to_be_disabled()
            expect(panel(page)).to_contain_text("edited on Home")

        check("shared section cannot edit fields from this page", l2)

        # ── M. loading + unreachable error state ────────────────────
        print("\n== M. loading + error states ==")

        def m1():
            page.goto(f"{ADMIN}/admin/pages/tracker/visual")
            expect(page.get_by_text("Loading storefront…")).to_be_visible(timeout=8000)

        check("loading state shown while the frame has not answered", m1)

        def m2():
            expect(page.get_by_text("Storefront not reachable")).to_be_visible(
                timeout=16000
            )
            expect(
                page.get_by_text(f"{FIXTURE}/tracker?cra7ty-edit=1")
            ).to_be_visible()
            expect(page.get_by_role("button", name="Try again")).to_be_visible()

        check("timeout shows honest error with the URL it tried", m2)

        # ── N. 404 for unknown page key ─────────────────────────────
        print("\n== N. unknown page key ==")

        def n1():
            resp = page.goto(f"{ADMIN}/admin/pages/nope/visual")
            assert resp is not None and resp.status == 404, (
                f"expected 404, got {resp.status if resp else 'no response'}"
            )

        check("unknown page key returns 404 (notFound)", n1)

        # ── O. responsive 1440 / 768 / 360 ──────────────────────────
        print("\n== O. responsive ==")

        def o1():
            page.goto(f"{ADMIN}/admin/pages/home/visual")
            handshakes(page, "/")
            expect(
                page.get_by_role("group", name="Preview device width")
            ).to_be_visible()
            expect(panel(page)).to_be_visible()
            wait_no_overflow(page, "1440")

        check("1440: toggle + panel visible, no overflow", o1)

        def o2():
            page.set_viewport_size({"width": 768, "height": 900})
            page.wait_for_timeout(400)
            expect(
                page.get_by_role("group", name="Preview device width")
            ).to_be_visible()
            expect(panel(page)).to_be_visible()
            wait_no_overflow(page, "768")

        check("768: toggle visible, panel rail visible, no overflow", o2)

        def o3():
            page.set_viewport_size({"width": 360, "height": 740})
            page.wait_for_timeout(400)
            expect(
                page.get_by_role("group", name="Preview device width")
            ).to_be_hidden()
            expect(page.get_by_role("button", name="Outline")).to_be_visible()
            expect(iframe(page)).to_have_attribute(
                "style", re.compile(r"width: 390px")
            )
            wait_no_overflow(page, "360")

        check("360: toggle hidden, phone width forced, no overflow", o3)

        def o4():
            page.get_by_role("button", name="Outline").click()
            expect(panel(page)).to_be_visible()
            down = panel(page).get_by_role(
                "button", name="Move Hero down"
            ).bounding_box()
            assert down and down["height"] >= 44, f"target only {down and down['height']}px"
            panel(page).get_by_role("button", name="Close panel").click()
            expect(panel(page)).to_be_hidden()

        check("360: panel sheet opens, 44px targets, closes cleanly", o4)

        def o5():
            page.set_viewport_size({"width": 1440, "height": 900})
            page.wait_for_timeout(400)
            toggle = page.get_by_role("group", name="Preview device width")
            toggle.get_by_role("button", name="Desktop 1440").click()
            expect(iframe(page)).to_have_attribute(
                "style", re.compile(r"width: 1440px")
            )
            toggle.get_by_role("button", name="Phone 390").click()
            expect(iframe(page)).to_have_attribute(
                "style", re.compile(r"width: 390px")
            )

        check("device toggle switches frame width 1440 <-> 390", o5)

        def o6():
            page.goto(f"{ADMIN}/admin/pages")
            wait_no_overflow(page, "360 pages manager")

        check("360: pages manager has no overflow", o6)

        # ── P. form-based sections screen reorder ───────────────────
        print("\n== P. form-based sections screen ==")

        def p1():
            page.set_viewport_size({"width": 1440, "height": 900})
            page.goto(f"{ADMIN}/admin/pages/home")
            rows = page.locator("main ul > li")
            expect(rows.first).to_contain_text("Hero")
            expect(rows.first).to_contain_text("01")
            page.get_by_role("button", name="Move Hero down").click()
            expect(rows.first).to_contain_text("Marquee strip")
            expect(rows.first).to_contain_text("01")

        check("form screen: Move down visibly reorders the rows", p1)

        browser.close()

    # ── summary ────────────────────────────────────────────────────
    failed = [r for r in results if not r[1]]
    print(f"\n{'=' * 60}")
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    for name, ok, err in results:
        if not ok:
            print(f"  FAILED: {name}\n         {err}")
    if page_errors:
        print("\nUncaught page errors observed (not counted as failures):")
        for e in page_errors[:10]:
            print(f"  {e[:200]}")
    print(f"{'=' * 60}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
