"""Step 4 E2E: admin (3000) + storefront dev (3100), live handshake.

Covers: normal-visit gating, handshake, click-to-select, live set-field,
typing-does-not-remount, wrong-origin messages (admin + frame side),
script tag as plain text, section select/move/hide from the admin panel,
remount-on-reorder vs class-only-on-hide, variant draft, publish,
history restore, discard, and 360/768/1440 overflow.

IMPORTANT: the admin's mock content lives in memory only (no storage
persistence), so after the first content mutation every navigation is
client-side (sidebar / card links) — never page.goto().
"""

import json
import re
import sys
import time

from playwright.sync_api import sync_playwright

ADMIN = "http://localhost:3000"
STORE = "http://localhost:3100"
SCRIPT_TAG = "<script>alert(1)</script>"

report = {}
failures = []


def check(name, ok, detail=""):
    report[name] = {"pass": bool(ok), "detail": detail}
    print(("PASS " if ok else "FAIL ") + name + ("  :: " + str(detail)[:300] if detail else ""))
    if not ok:
        failures.append(name)


def wait_until(fn, timeout=10, interval=0.25):
    """Poll fn() until truthy; returns the last truthy value or falsy/exception."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = fn()
            if last:
                return last
        except Exception as exc:  # detached frame, stale node...
            last = exc
        time.sleep(interval)
    return last


def frame_of(page):
    frames = [f for f in page.frames if ":3100" in f.url]
    return frames[-1] if frames else None


def open_visual(page):
    """Client-side: Pages manager -> Home card -> visual editor, then handshake."""
    page.get_by_role("link", name="Pages", exact=True).click()
    page.wait_for_url("**/admin/pages", timeout=15000)
    page.get_by_role("link", name="Open visual editor").first.click()
    page.wait_for_url("**/admin/pages/home/visual", timeout=15000)
    fr = page.frame_locator('iframe[title="Storefront preview"]')
    fr.locator('[data-cra7ty-key="home.hero.eyebrow"]').wait_for(
        state="visible", timeout=120_000
    )
    page.get_by_text("Loading storefront…").wait_for(state="hidden", timeout=15_000)
    return fr


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ── 0. normal visit: no edit UI on the storefront ──────────────
    ctx0 = browser.new_context(viewport={"width": 1440, "height": 900})
    pg0 = ctx0.new_page()
    pg0.goto(STORE + "/", wait_until="networkidle")
    normal = pg0.evaluate(
        """() => ({
            keys: document.querySelectorAll('[data-cra7ty-key]').length,
            sections: document.querySelectorAll('[data-cra7ty-section]').length,
            hiddenTags: document.querySelectorAll('.cra7ty-section--hidden').length,
        })"""
    )
    check(
        "normal_visit_has_no_edit_ui",
        normal["keys"] == 0 and normal["sections"] == 0 and normal["hiddenTags"] == 0,
        normal,
    )
    ctx0.close()

    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(15000)
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))

    # ── 1. login (mock cookie) ─────────────────────────────────────
    page.goto(ADMIN + "/admin/login", wait_until="load")
    page.wait_for_load_state("networkidle")  # let the client handler attach
    page.fill('input[type="email"]', "demo@cra7tyhub.com")
    page.fill('input[type="password"]', "demo-password")
    for attempt in range(2):
        page.click('button[type="submit"]')
        try:
            page.wait_for_url(re.compile(r".*/admin/(dashboard|pages).*"), timeout=15000)
            break
        except Exception:
            # first click raced hydration (native GET fallback) — retry
            page.wait_for_load_state("networkidle")
    page.wait_for_url(re.compile(r".*/admin/(dashboard|pages).*"), timeout=15000)
    check("login", "/admin/" in page.url, page.url)

    # ── 2. visual editor + handshake ───────────────────────────────
    page.goto(ADMIN + "/admin/pages/home/visual", wait_until="domcontentloaded")
    fr = page.frame_locator('iframe[title="Storefront preview"]')
    fr.locator('[data-cra7ty-key="home.hero.eyebrow"]').wait_for(
        state="visible", timeout=120_000
    )
    page.get_by_text("Loading storefront…").wait_for(state="hidden", timeout=15_000)
    frame = frame_of(page)
    check("handshake_loading_overlay_gone", frame is not None)

    key_count = frame.evaluate(
        "() => document.querySelectorAll('[data-cra7ty-key]').length"
    )
    section_ids = frame.evaluate(
        """() => [...document.querySelectorAll('[data-cra7ty-section]')]
             .map((el) => el.getAttribute('data-cra7ty-section'))"""
    )
    check("frame_registered_keys", key_count > 100, f"{key_count} keys")
    check("frame_sections_present", len(section_ids) >= 9, section_ids)
    check(
        "panel_outline_rendered",
        page.locator("aside").get_by_text("9 sections").count() > 0,
        "outline shows 9 sections",
    )

    # ── 3. click-to-select + live set-field ────────────────────────
    fr.locator('[data-cra7ty-key="home.hero.headline.0"]').click()
    page.locator("aside").get_by_text("Headline line 1").first.wait_for(timeout=10000)
    page.locator("aside").get_by_role("textbox").first.fill("Edited live in the frame")
    got = wait_until(
        lambda: "Edited live in the frame"
        in frame.locator('[data-cra7ty-key="home.hero.headline.0"]').inner_text(),
        timeout=8,
    )
    check("live_set_field_updates_frame", bool(got))

    # stash node identities for remount tests
    frame.evaluate(
        """() => {
            window.__mq = document.querySelector('[data-cra7ty-section="marquee"]').firstElementChild;
            window.__hero = document.querySelector('[data-cra7ty-section="hero"]').firstElementChild;
        }"""
    )
    time.sleep(0.6)
    typing_kept_nodes = frame.evaluate("() => window.__mq.isConnected && window.__hero.isConnected")
    check("typing_does_not_remount_sections", typing_kept_nodes)

    # ── 4. wrong-origin / malformed messages ignored ───────────────
    title_before = page.locator("aside p").first.inner_text()
    page.evaluate(
        """() => {
            window.postMessage({source:'cra7ty', type:'select-field', payload:{key:'home.hero.subline'}}, '*');
            window.postMessage({source:'cra7ty', type:'set-field', payload:{key:'home.hero.headline.0', value:'HACKED'}}, '*');
            window.postMessage({source:'cra7ty', type:'not-a-real-type', payload:{}}, '*');
        }"""
    )
    frame.evaluate(
        """() => window.postMessage({source:'cra7ty', type:'set-field', payload:{key:'home.hero.headline.0', value:'HACKED'}}, '*')"""
    )
    time.sleep(0.8)
    title_after = page.locator("aside p").first.inner_text()
    headline_text = frame.locator('[data-cra7ty-key="home.hero.headline.0"]').inner_text()
    check(
        "wrong_origin_ignored_by_admin",
        title_before == title_after and "HACKED" not in headline_text,
        f"panel title {title_before!r} -> {title_after!r}",
    )
    check("wrong_origin_ignored_by_frame", "HACKED" not in headline_text)

    # ── 5. pasted <script> renders as plain text ───────────────────
    fr.locator('[data-cra7ty-key="home.hero.eyebrow"]').click()
    page.locator("aside").get_by_role("textbox").first.wait_for(timeout=10000)
    page.locator("aside").get_by_role("textbox").first.fill(SCRIPT_TAG)
    wait_until(
        lambda: frame.locator('[data-cra7ty-key="home.hero.eyebrow"]').inner_text().strip()
        == SCRIPT_TAG,
        timeout=8,
    )
    eyebrow = frame.evaluate(
        """() => {
            const el = document.querySelector('[data-cra7ty-key="home.hero.eyebrow"]');
            return {
                text: el.textContent,
                escaped: el.outerHTML.includes('&lt;script&gt;'),
                injected: [...document.scripts].some((s) => s.textContent.includes('alert(1)')),
            };
        }"""
    )
    check(
        "script_tag_renders_as_plain_text",
        eyebrow["text"] == SCRIPT_TAG and eyebrow["escaped"] and not eyebrow["injected"] and not dialogs,
        eyebrow,
    )

    # ── 6. select the hero section (frame -> section controls) ─────
    path = None
    try:
        fr.locator('[data-cra7ty-section="hero"]').click(timeout=3000, position={"x": 8, "y": 8})
        if wait_until(lambda: page.get_by_role("button", name="Move Hero down").count() > 0, timeout=3):
            path = "real click (display:contents wrapper)"
    except Exception:
        pass
    if path is None:
        # wrapper is display:contents (no hit box of its own) — dispatch the
        # same bubbling MouseEvent the browser would send; React's root
        # listener routes it to the wrapper's onClick exactly as a real click
        frame.evaluate(
            """() => document.querySelector('[data-cra7ty-section="hero"]')
                 .dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))"""
        )
        if wait_until(lambda: page.get_by_role("button", name="Move Hero down").count() > 0, timeout=5):
            path = "dispatched bubbling MouseEvent"
    if path is None:
        page.get_by_role("button", name="Close panel").click()
        page.get_by_role("button", name=re.compile("^Hero$")).first.click()
        page.get_by_role("button", name="Move Hero down").wait_for(timeout=8000)
        path = "admin outline fallback"
    check("select_section_opens_controls", True, f"via {path}")

    # ── 7. reorder from the admin panel: remounts (fold-in replay) ─
    order_before = frame.evaluate(
        """() => [...document.querySelectorAll('[data-cra7ty-section]')]
             .map((el) => el.getAttribute('data-cra7ty-section'))"""
    )
    page.get_by_role("button", name="Move Hero down").click()
    order_after = wait_until(
        lambda: (
            lambda o: o
            if o.index("hero") > o.index("marquee")
            else None
        )(
            frame.evaluate(
                """() => [...document.querySelectorAll('[data-cra7ty-section]')]
                     .map((el) => el.getAttribute('data-cra7ty-section'))"""
            )
        ),
        timeout=8,
    )
    check(
        "move_down_reorders_frame",
        bool(order_after),
        f"{order_before[:4]}... -> {[s for s in (order_after or [])][:4]}...",
    )
    remounted = frame.evaluate("() => !window.__mq.isConnected && !window.__hero.isConnected")
    check(
        "reorder_remounts_sections_once",
        remounted,
        "pre-move DOM nodes disconnected -> fold-in replays via versioned remount",
    )

    # ── 8. hide + unhide: class-only update, no remount ────────────
    frame.evaluate(
        """() => { window.__hero2 = document.querySelector('[data-cra7ty-section="hero"]').firstElementChild; }"""
    )
    page.get_by_role("switch", name="Hero visible").click()
    hidden_state = wait_until(
        lambda: frame.evaluate(
            """() => {
                const el = document.querySelector('[data-cra7ty-section="hero"]');
                if (!el.classList.contains('cra7ty-section--hidden')) return null;
                const child = el.firstElementChild;
                return {
                    dimmed: getComputedStyle(child).opacity,
                    tag: getComputedStyle(child, '::after').content,
                    keptNode: window.__hero2.isConnected,
                };
            }"""
        ),
        timeout=8,
    )
    check(
        "hide_dims_and_tags_section",
        bool(hidden_state)
        and hidden_state["dimmed"] == "0.35"
        and hidden_state["tag"].strip('"') == "Hidden",
        hidden_state,
    )
    check("hide_updates_in_place_no_remount", bool(hidden_state) and hidden_state["keptNode"])
    page.get_by_role("switch", name="Hero visible").click()
    unhidden = wait_until(
        lambda: frame.evaluate(
            """() => !document.querySelector('[data-cra7ty-section="hero"]')
                 .classList.contains('cra7ty-section--hidden')"""
        ),
        timeout=8,
    )
    check("unhide_restores_section", bool(unhidden))

    # ── 9. variant chip drafts a layout change ─────────────────────
    page.get_by_role("button", name="stacked", exact=True).click()
    badge = wait_until(
        lambda: (lambda m: m.group(0) if m else None)(
            re.search(r"\d+ unpublished changes?", page.locator("body").inner_text())
        ),
        timeout=5,
    )
    check("variant_records_draft", badge == "3 unpublished changes", badge)

    # ── 10. publish via DraftBar ───────────────────────────────────
    page.get_by_role("button", name="Publish", exact=True).first.click()
    page.locator('[role="dialog"]').get_by_role("button", name="Publish", exact=True).click()
    publish_note = wait_until(
        lambda: (lambda loc: loc.inner_text() if loc.count() else None)(
            page.locator('[role="status"]')
        ),
        timeout=8,
    )
    check(
        "publish_records_revision",
        bool(publish_note) and publish_note.startswith("Published 3 changes"),
        publish_note,
    )

    # ── 11. published value flows into a fresh frame (init overlay) ─
    fr = open_visual(page)
    frame = frame_of(page)
    headline_after_publish = wait_until(
        lambda: frame.locator('[data-cra7ty-key="home.hero.headline.0"]').inner_text(),
        timeout=10,
    )
    check(
        "published_value_flows_through_init",
        "Edited live in the frame" in (headline_after_publish or ""),
        f"frame headline: {headline_after_publish!r} (static copy is 'Folded by hand,')",
    )

    # ── 12. history: restore the newest revision ───────────────────
    page.get_by_role("link", name="History", exact=True).click()
    page.wait_for_url("**/admin/history", timeout=15000)
    count_before = wait_until(
        lambda: (lambda m: int(m.group(1)) if m else None)(
            re.search(r"(\d+) revisions?", page.locator("body").inner_text())
        ),
        timeout=8,
    )
    page.get_by_role("button", name="Restore", exact=True).first.click()
    page.locator('[role="dialog"]').get_by_role("button", name="Restore", exact=True).click()
    count_after = wait_until(
        lambda: (lambda m: int(m.group(1)) if m and int(m.group(1)) > (count_before or 0) else None)(
            re.search(r"(\d+) revisions?", page.locator("body").inner_text())
        ),
        timeout=8,
    )
    # the newest (reversal) card starts collapsed — expand it, then the
    # top <li> holds only that card's diff (toggling closes the older one)
    page.get_by_role("button", name=re.compile(r"\d+ changes")).first.click()
    time.sleep(0.4)
    top_card = page.locator("ul[class*='border-l'] > li").first.inner_text()
    check(
        "history_restore_records_reversal",
        count_after == (count_before or 0) + 1,
        f"{count_before} -> {count_after} revisions",
    )
    check(
        "restore_revision_diff_shows_original",
        "Folded by hand," in top_card and "Edited live in the frame" in top_card,
        top_card[:200].replace("\n", " | "),
    )

    # ── 13. restored value flows back into the frame ───────────────
    fr = open_visual(page)
    frame = frame_of(page)
    headline_restored = wait_until(
        lambda: frame.locator('[data-cra7ty-key="home.hero.headline.0"]').inner_text(),
        timeout=10,
    )
    check(
        "restored_value_flows_into_frame",
        bool(headline_restored)
        and "Folded by hand," in headline_restored
        and "Edited live" not in headline_restored,
        f"frame headline: {headline_restored!r}",
    )

    # ── 14. discard flow (already on the visual route from step 13) ─
    fr.locator('[data-cra7ty-key="home.hero.subline"]').click()
    page.locator("aside").get_by_role("textbox").first.wait_for(timeout=10000)
    page.locator("aside").get_by_role("textbox").first.fill("temp edit for discard")
    badge = wait_until(
        lambda: (lambda m: m.group(0) if m else None)(
            re.search(r"\d+ unpublished change\b", page.locator("body").inner_text())
        ),
        timeout=5,
    )
    check("discard_draft_count", badge == "1 unpublished change", badge)
    page.get_by_role("button", name="Discard", exact=True).first.click()
    page.locator('[role="dialog"]').get_by_role("button", name="Discard changes").click()
    discard_note = wait_until(
        lambda: (lambda loc: loc.inner_text() if loc.count() else None)(
            page.locator('[role="status"]')
        ),
        timeout=8,
    )
    check(
        "discard_clears_drafts",
        bool(discard_note) and discard_note.startswith("Drafts discarded"),
        discard_note,
    )

    # ── 15. overflow at 360 / 768 / 1440 ───────────────────────────
    overflow = {}
    for w in (360, 768, 1440):
        page.set_viewport_size({"width": w, "height": 900})
        time.sleep(0.6)
        admin_delta = page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        toggle_visible = page.get_by_role("group", name="Preview device width").is_visible()
        overflow[f"admin@{w}"] = {"delta_px": admin_delta, "toggle_visible": toggle_visible}
        check(f"no_admin_overflow_at_{w}", admin_delta == 0, f"{admin_delta}px")
    check(
        "device_toggle_responsive",
        not overflow["admin@360"]["toggle_visible"]
        and overflow["admin@768"]["toggle_visible"]
        and overflow["admin@1440"]["toggle_visible"],
        {k: v["toggle_visible"] for k, v in overflow.items()},
    )
    # frame inner overflow at each device width
    frame_overflow = {}
    for label in ("Desktop 1440", "Tablet 768", "Phone 390"):
        page.get_by_role("button", name=label).click()
        time.sleep(0.8)
        frame_overflow[label] = frame.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
    check(
        "no_frame_overflow_at_any_device",
        all(v == 0 for v in frame_overflow.values()),
        frame_overflow,
    )

    check("no_alert_dialogs_throughout", not dialogs, dialogs)
    report["_failures"] = failures
    print("\n" + json.dumps(report, indent=2, default=str))
    browser.close()
    sys.exit(1 if failures else 0)
