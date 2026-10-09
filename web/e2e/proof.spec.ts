import { expect, test } from "@playwright/test";

test("unmeasured mainnet results show PENDING, never zero", async ({ page }) => {
  await page.goto("/proof");
  const pending = page.locator("section").filter({ has: page.getByRole("heading", { name: "Not yet proven" }) }).first();
  await expect(pending.getByText("PENDING").first()).toBeVisible();
  await expect(pending).not.toContainText(/\b0(\.00)? AUSD\b/);
});

test("proof page labels local and simulated results as such", async ({ page }) => {
  await page.goto("/proof");
  // Match the evidence badges exactly (methodology text inside collapsed details also says "simulated").
  await expect(page.getByText("Local reproduction", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Simulated", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/null threshold/i).first()).toBeVisible();
});

test("landing keeps proof out of the hero and states what is not yet proven", async ({ page }) => {
  await page.goto("/");
  // Hero: product message and actions only.
  const hero = page.locator("#product");
  await expect(hero.getByRole("heading", { level: 1 })).toContainText("Trading credit with risk enforced at the order layer");
  await expect(hero.getByText(/Contract-level risk rejection|Contracts deployed/)).toHaveCount(0);
  // Proof section below the hero.
  await expect(page.getByRole("heading", { name: "Verified on Monad testnet" })).toBeVisible();
  await expect(page.getByText("Contract-level risk rejection")).toBeVisible();
  await expect(page.getByText(/Not yet:.*mainnet/)).toBeVisible();
});

test("proof page shows the measured contract rejection", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByText(/reverted by the contract with LeverageExceeded/i).first()).toBeVisible();
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

test("rpc proxy forwards reads only and keeps the two providers separate", async ({ request }) => {
  const send = (which: string, method: string, params: unknown[] = []) =>
    request.post(`/api/rpc/${which}`, { data: { jsonrpc: "2.0", id: 1, method, params } });
  expect((await send("primary", "eth_sendRawTransaction", ["0x00"])).status()).toBe(403);
  expect((await send("verify", "eth_sign", [])).status()).toBe(403);
  expect((await send("elsewhere", "eth_chainId")).status()).toBe(404);
  const r = await send("verify", "eth_chainId");
  expect(r.status()).toBe(200);
  expect(r.headers()["x-imprest-upstream"]).toBe("verify");
  expect((await r.json()).result).toBe("0x279f"); // 10143
});
