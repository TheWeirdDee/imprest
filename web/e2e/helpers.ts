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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow ${label}`).toBeLessThanOrEqual(0);
}

export async function expectNoPlaceholder(page: Page) {
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const bad of ["lorem ipsum", "placeholder", "undefined", "[object object]", "nan aus"]) {
    expect(text, `found "${bad}"`).not.toContain(bad);
  }
}
