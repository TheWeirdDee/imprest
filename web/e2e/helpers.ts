import { expect, type Page } from "@playwright/test";

/** Collects console errors and page errors; the suite fails on any. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export async function expectNoOverflow(page: Page, label = "") {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - W;
    const culprits: string[] = [];
    if (overflow > 0) {
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const rc = el.getBoundingClientRect();
        const textSpills = el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === "visible";
        if ((rc.right <= W + 1 && !textSpills) || rc.width === 0) continue;
        let a = el.parentElement;
        let scrolls = false;
        while (a && a !== document.body) {
          if (["auto", "scroll", "hidden"].includes(getComputedStyle(a).overflowX)) {
            scrolls = true;
            break;
          }
          a = a.parentElement;
        }
        if (!scrolls && el.children.length === 0 && el.scrollWidth > el.clientWidth + 2) culprits.push(`text ${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
        else if (!scrolls) culprits.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
        if (culprits.length >= 3) break;
      }
    }
    return { overflow, culprits };
  });
  expect(r.overflow, `horizontal overflow ${label}: ${r.culprits.join(" | ")}`).toBeLessThanOrEqual(0);
}

export async function expectNoPlaceholder(page: Page) {
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const bad of ["lorem ipsum", "placeholder", "undefined", "[object object]", "nan aus"]) {
    expect(text, `found "${bad}"`).not.toContain(bad);
  }
}
