import { expect, test } from "@playwright/test";
import { expectNoOverflow, expectNoPlaceholder, watchErrors } from "./helpers";

const ROUTES: [string, RegExp][] = [
  ["/", /Trading credit with risk enforced/],
  ["/app", /Dashboard/],
  ["/app/trade/btc", /BTC-PERP/],
  ["/app/trade/eth", /ETH-PERP/],
  ["/app/desk", /Desk/],
  ["/app/risk", /Risk center/],
  ["/app/positions", /Positions/],
  ["/app/history", /History/],
  ["/app/claims", /Claims and payout/],
  ["/app/proof", /My receipts/],
  ["/lp", /LP risk console/],
  ["/proof", /Proof, not promises\./],
  ["/docs", /Documentation/],
  ["/status", /System status/],
];

for (const [path, heading] of ROUTES) {
  test(`renders ${path} with the testnet banner, no errors, no placeholder copy`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(heading);
    await expect(page.getByRole("note", { name: /TESTNET environment/ })).toBeVisible();
    await expectNoPlaceholder(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("unknown market is a 404, not a crash", async ({ page }) => {
  const res = await page.goto("/app/trade/doge");
  expect(res?.status()).toBe(404);
});

for (const width of [320, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000); // 12 pages against live testnet RPCs
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/proof", "/app", "/app/trade/btc", "/app/positions", "/app/desk", "/app/risk", "/app/claims", "/app/history", "/lp", "/status", "/docs"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNoOverflow(page, `${path} @ ${width}px`);
    }
  });
}

// Same sweep with real desk data: the testnet trader's PUBLIC address remembered on the device
// (the read-only "locked" session after a reload). No key is involved.
const TRADER = "0xae7848e88635946C233e8A2F431dDAEc37E7B3E3";
for (const width of [320, 375, 390, 414, 768, 1024, 1280, 1440]) {
  test(`no horizontal overflow with a funded desk loaded at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript((addr) => localStorage.setItem("imprest.account.v1.testnet", JSON.stringify({ address: addr, kind: "mera" })), TRADER);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/app", "/app/trade/btc", "/app/positions", "/app/desk", "/app/risk", "/app/claims", "/app/history", "/app/proof"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByRole("button", { name: /^Account 0x/ })).toBeVisible();
      await expectNoOverflow(page, `${path} @ ${width}px with desk`);
    }
  });
}

// Regression: without an indexer, History falls back to a chain scan. Monad's RPC rejects
// eth_getLogs ranges over 100 blocks; the scan must not fail (it once used 1,000-block chunks).
test("history loads from the chain scan when no indexer is configured", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript((addr) => localStorage.setItem("imprest.account.v1.testnet", JSON.stringify({ address: addr, kind: "mera" })), TRADER);
  await page.goto("/app/history", { waitUntil: "networkidle" });
  // The build decides the source (NEXT_PUBLIC_INDEXER_URL is baked in), so read it from the page.
  const source = page.getByText(/^Source: /);
  await expect(source).toBeVisible({ timeout: 60_000 });
  test.skip((await source.innerText()).includes("Envio indexer"), "this build has an indexer configured");
  await expect(page.getByText(/Source: bounded RPC scan of blocks \d+-\d+/)).toBeVisible();
  await expect(page.getByText("History unavailable")).toHaveCount(0);
});
