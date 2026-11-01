"""Post-deploy verification of the Courses admin section on PRODUCTION.

Run: python .verify/e2e-courses-live.py

Uses the ch_admin_session cookie captured by the node login helper
(.verify/test-session.json). Checks, in order:
  1  /admin/courses lists the seeded test course
  2  editing that course's price through the live CourseEditor saves
  3  /admin/products does NOT list the course
  4  /admin/products/<course-id> redirects to /admin/courses/<course-id>
  5  dashboard low-stock alert does NOT list the course (stock 0)

Writes: three screenshots (list, edit, products) as evidence.
Exits 1 on any failure.
"""
import json
import re
import sys
from playwright.sync_api import sync_playwright

ADMIN = "https://cra7ty-hub-admin.vercel.app"

with open(".verify/test-session.json", encoding="utf8") as f:
    cookie = json.load(f)["cookie"]  # "ch_admin_session=..."
with open(".verify/test-course.json", encoding="utf8") as f:
    course = json.load(f)
COURSE_ID = course["id"]
COURSE_NAME = course["name"]

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    k, v = cookie.split("=", 1)
    ctx.add_cookies(
        [{"name": k, "value": v, "domain": "cra7ty-hub-admin.vercel.app", "path": "/"}]
    )
    page = ctx.new_page()

    # 1. the Courses list shows the test course
    page.goto(f"{ADMIN}/admin/courses", wait_until="networkidle")
    body = page.inner_text("body")
    check("/admin/courses loads", "Courses" in body)
    check("list shows the test course", COURSE_NAME in body, f"'{COURSE_NAME}' in table")
    check("list shows Files count", re.search(r"\bFiles\b", body) is not None)
    page.screenshot(path=".verify/v-courses-list.png", full_page=True)

    # 2. edit the price through the live CourseEditor
    page.goto(f"{ADMIN}/admin/courses/{COURSE_ID}", wait_until="networkidle")
    price = page.locator("#course-price")
    check("editor opens for the course", price.count() == 1)
    price.fill("7777")
    # Publish (not Save draft) — the course must stay active for the
    # /shop exclusion check below to prove anything.
    page.get_by_role("button", name="Publish", exact=True).click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("save reports success", "Saved" in body or "Published" in body,
          next((l for l in body.splitlines() if "Saved" in l or "Published" in l), ""))
    page.screenshot(path=".verify/v-courses-edit.png", full_page=True)

    # 3. /admin/products does NOT list the course
    page.goto(f"{ADMIN}/admin/products", wait_until="networkidle")
    body = page.inner_text("body")
    check("/admin/products does NOT list the course", COURSE_NAME not in body)
    page.screenshot(path=".verify/v-products-no-course.png", full_page=True)

    # 4. old product URL redirects to the course editor
    page.goto(f"{ADMIN}/admin/products/{COURSE_ID}", wait_until="networkidle")
    page.wait_for_url(f"**/admin/courses/{COURSE_ID}", timeout=15000)
    check("old /admin/products/<id> redirects to /admin/courses/<id>",
          page.url == f"{ADMIN}/admin/courses/{COURSE_ID}", page.url)

    # 5. dashboard low-stock alert excludes the course (stock 0)
    page.goto(f"{ADMIN}/admin/dashboard", wait_until="networkidle")
    body = page.inner_text("body")
    check("dashboard low-stock alert excludes the course", COURSE_NAME not in body)
    page.screenshot(path=".verify/v-dashboard.png", full_page=True)

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    sys.exit(1)
