import { expect, test, type Page } from "@playwright/test";

// Regression tests for the 2026-10-09 audit. Public addresses only (no keys):
// - CLOSED_TRADER: the owner's walkthrough account; its only desk 0x4802…bFaD is closed and paid 99.943818 AUSD.
// - FUNDED_TRADER: the testnet trader whose latest desk 0xfc65…FCC6 is active (graduated, below its HWM).
const CLOSED_TRADER = "0x976C766eC9D72D6a23bdcf923e8E138113cF25fE";
const FUNDED_TRADER = "0xae7848e88635946C233e8A2F431dDAEc37E7B3E3";

const remember = (page: Page, address: string) =>
  page.addInitScript((a) => localStorage.setItem("imprest.account.v1.testnet", JSON.stringify({ address: a, kind: "mera" })), address);

test.describe("closed desk", () => {
  test.beforeEach(async ({ page }) => remember(page, CLOSED_TRADER));

  test("dashboard shows the settlement, not withdrawal as a trading loss", async ({ page }) => {
    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Desk closed" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("99.943818 AUSD")).toBeVisible();
    await expect(page.getByText("-0.056182 AUSD")).toBeVisible();
    await expect(page.getByText("Realized PnL", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/anyone can/i)).toHaveCount(0);
  });

  test("claims and risk show the closed state, with no eligibility or limits", async ({ page }) => {
    await page.goto("/app/claims", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Desk closed" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/must rise|Needs .* more/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Claim realized profit/ })).toHaveCount(0);
    await page.goto("/app/risk", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Desk closed" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("How close am I to losing my desk?")).toHaveCount(0);
  });

  test("trade shows one settled-desk message: no risk meter, estimates, breach messages or submit", async ({ page }) => {
    await page.goto("/app/trade/btc", { waitUntil: "networkidle" });
    await expect(page.getByText("This desk is closed and settled")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Buy \/ Long BTC|Sell \/ Short BTC/ })).toHaveCount(0);
    await expect(page.getByText(/Distance to (desk floor|daily loss limit)/)).toHaveCount(0);
    await expect(page.getByText(/above the nearest limit|Below a loss limit|daily loss limit reached|below floor/i)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Policy check" })).toHaveCount(0);
  });

  test("desk page shows the settlement, no graduation progress or Graduate action", async ({ page }) => {
    await page.goto("/app/desk", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Desk closed" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/closed at this tier/)).toBeVisible();
    await expect(page.getByText(/^Progress to /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Graduate/ })).toHaveCount(0);
    await expect(page.getByText(/-100\.00%/)).toHaveCount(0);
    await expect(page.getByText("current", { exact: true })).toHaveCount(0);
  });
});

test("signing out clears the previous account's numbers immediately, without a refresh", async ({ page }) => {
  await remember(page, FUNDED_TRADER);
  await page.goto("/app", { waitUntil: "networkidle" });
  await expect(page.getByText("Restricted credit", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Account 0x/ }).click();
  await page.getByRole("menuitem", { name: /Sign out on this device/ }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: /^Sign in$/ })).toBeVisible();
  await expect(page.getByText("Restricted credit", { exact: true })).toHaveCount(0);
  await expect(page.getByText("493.", { exact: false })).toHaveCount(0);
});

test("claims shortfall is the real amount, never 0.00", async ({ page }) => {
  await remember(page, FUNDED_TRADER);
  await page.goto("/app/claims", { waitUntil: "networkidle" });
  const msg = page.getByText(/Realized equity must rise [\d.,]+ AUSD to exceed the high-water mark/);
  await expect(msg).toBeVisible({ timeout: 30_000 });
  await expect(msg).not.toContainText("rise 0.00 ");
});

test("the contract-rejection test is a collapsed developer action with a gas warning", async ({ page }) => {
  await remember(page, FUNDED_TRADER);
  await page.goto("/app/trade/btc", { waitUntil: "networkidle" });
  await expect(page.getByText(/max 5\.00x/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("slider").fill("6");
  const dev = page.getByText(/Developer: prove the contract rejects this order/);
  await expect(dev).toBeVisible();
  await expect(page.getByRole("button", { name: "Send expected-revert transaction" })).toBeHidden();
  await dev.click();
  await expect(page.getByText(/you still pay its gas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send expected-revert transaction" })).toBeVisible();
});

test("order preview names the limit it measures against", async ({ page }) => {
  await remember(page, FUNDED_TRADER);
  await page.goto("/app/trade/btc", { waitUntil: "networkidle" });
  await expect(page.getByText(/^Distance to (desk floor|daily loss limit)$/)).toBeVisible({ timeout: 30_000 });
});

test("invalid size shows a field message and no misleading estimates", async ({ page }) => {
  await remember(page, FUNDED_TRADER);
  await page.goto("/app/trade/btc", { waitUntil: "networkidle" });
  await page.getByLabel(/Size/).fill("abc");
  await expect(page.getByText(/^Size: enter a positive amount of BTC/)).toBeVisible();
  const notional = page.locator("dt", { hasText: /^Notional$/ }).locator("xpath=following-sibling::dd[1]");
  await expect(notional).toHaveText("—");
});

test("/api/version reports the commit this build came from", async ({ request }) => {
  const r = await request.get("/api/version");
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(j.chainId).toBe(10143);
});

test("proof page leads with completed testnet results and links mainnet claims to the mainnet explorer", async ({ page }) => {
  await page.goto("/proof", { waitUntil: "networkidle" });
  await expect(page.getByText("Over-limit order rejected by the contract (testnet)")).toBeVisible();
  const mainnetCard = page.locator("section,div").filter({ has: page.getByText("10. Mainnet dependency status") }).last();
  const hrefs = await mainnetCard.locator("a[href*='monadscan'], a[href*='monadexplorer'], a[href*='socialscan']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  for (const h of hrefs) expect(h, h).not.toMatch(/testnet/);
  const evidence = page.locator("a[href*='github.com/TheWeirdDee/imprest/blob/main/']");
  expect(await evidence.count()).toBeGreaterThan(5);
});

test("status distinguishes 'not configured' from 'down' and shows the build", async ({ page }) => {
  await page.goto("/status", { waitUntil: "networkidle" });
  await expect(page.getByText("This deployment")).toBeVisible();
  await expect(page.getByText(/not running/)).toHaveCount(0);
});
