import { expect, test } from "@playwright/test";

test("money shot shows PENDING, never zero, for unmeasured mainnet results", async ({ page }) => {
  await page.goto("/proof");
  const money = page.locator("main section").first();
  await expect(money.getByText("PENDING").first()).toBeVisible();
  await expect(money).not.toContainText(/\b0(\.00)? AUSD\b/);
});

test("proof page labels local and simulated results as such", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByText("Local reproduction").first()).toBeVisible();
  await expect(page.getByText("Simulated").first()).toBeVisible();
  await expect(page.getByText(/null threshold/i).first()).toBeVisible();
});

test("landing shows the measured contract rejection and what is not yet proven", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/reverted by the contract with LeverageExceeded/i).first()).toBeVisible();
  await expect(page.getByText(/Not proven, or measured against us/)).toBeVisible();
});

test("internal links resolve (no broken links)", async ({ page, request }) => {
  const seen = new Set<string>();
  for (const start of ["/", "/proof", "/docs", "/app", "/lp", "/status"]) {
    await page.goto(start);
    const hrefs = await page.$$eval("a[href^='/']", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
    for (const h of hrefs) {
      const path = h.split("#")[0] ?? "";
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const r = await request.get(path);
      expect(r.status(), `broken link ${path} on ${start}`).toBeLessThan(400);
    }
  }
  expect(seen.size).toBeGreaterThan(10);
});

test("market-data proxy only serves allowlisted read paths", async ({ request }) => {
  expect((await request.get("/api/perpl/evil/path")).status()).toBe(400);
  expect((await request.get("/api/perpl/trading/orders")).status()).toBe(400);
});
