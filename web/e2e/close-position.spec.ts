import { expect, test, type Page } from "@playwright/test";
import { gotoReady } from "./helpers";
import { decodeFunctionData, decodeFunctionResult, encodeFunctionResult, type Abi, type Hex } from "viem";
import getPositionAbi from "./fixtures-getposition-abi.json" with { type: "json" };

// "Close position" prepares a reduce-only closing order in the ticket and never sends anything.
// No open position exists on testnet right now, so this test intercepts the app's own chain read
// of Perpl getPosition for the owner's current desk (Perpl account 1127, desk 0x640a…5DBf) and
// returns an open position. Nothing is signed or broadcast.
const OWNER = "0x976C766eC9D72D6a23bdcf923e8E138113cF25fE";
const ACCOUNT_ID = 1127n;
const EXCHANGE = "0x1964c32f0be608e7d29302aff5e61268e72080cc";
const abi = getPositionAbi as Abi;

async function fakePosition(page: Page, perpId: bigint, lots: bigint, positionType: 0 | 1) {
  await page.route("**/api/rpc/*", async (route) => {
    const body = route.request().postDataJSON() as { method?: string; params?: [{ to?: string; data?: Hex }] };
    const call = body?.params?.[0];
    if (body?.method !== "eth_call" || call?.to?.toLowerCase() !== EXCHANGE || !call.data?.startsWith("0x751de421")) return route.fallback();
    const { args } = decodeFunctionData({ abi, data: call.data });
    if (args?.[0] !== perpId || args?.[1] !== ACCOUNT_ID) return route.fallback();
    let json: { result: Hex };
    try {
      json = await (await route.fetch()).json();
    } catch {
      return; // the test (and page) ended while this read was in flight
    }
    const [info, mark, valid] = decodeFunctionResult({ abi, functionName: "getPosition", data: json.result }) as unknown as [Record<string, unknown>, bigint, boolean];
    const result = encodeFunctionResult({
      abi,
      functionName: "getPosition",
      result: [{ ...info, accountId: ACCOUNT_ID, positionType, lotLNS: lots, pricePNS: mark, depositCNS: 27_000_000n }, mark, valid] as never,
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...json, result }) });
  });
}

// Remove the read interceptor after each test so an in-flight read cannot outlive its test.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

const remember = (page: Page) =>
  page.addInitScript((a) => localStorage.setItem("imprest.account.v1.testnet", JSON.stringify({ address: a, kind: "mera" })), OWNER);

for (const [market, perpId, lots, sizeText, type, sideToPress] of [
  ["btc", 16n, 100n, "0.00100", 0, "Short"],
  ["btc", 16n, 100n, "0.00100", 1, "Long"],
  ["eth", 32n, 10n, "0.010", 0, "Short"],
] as const) {
  test(`Close position prepares a reduce-only ${sideToPress.toLowerCase()} for a ${market.toUpperCase()} ${type === 0 ? "long" : "short"}, without sending`, async ({ page }) => {
    await remember(page);
    await fakePosition(page, perpId, lots, type);
    let sent = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && /eth_sendRawTransaction|v1\/intents/.test(r.postData() ?? r.url())) sent = true;
    });
    await gotoReady(page, `/app/trade/${market}`);
    const btn = page.getByRole("button", { name: new RegExp(`Close ${market.toUpperCase()} (long|short) position`) }).first();
    await expect(btn).toBeVisible({ timeout: 30_000 });
    await btn.click();
    await expect(page.getByText(new RegExp(`Ready to close your ${market.toUpperCase()} (long|short)`))).toBeVisible();
    await expect(page.getByRole("button", { name: sideToPress, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel(/Reduce-only/)).toBeChecked();
    await expect(page.getByLabel(/^Size/)).toHaveValue(sizeText);
    expect(sent, "nothing may be sent by preparing a close").toBe(false);
  });
}

test("Close position is reachable by keyboard and at phone width", async ({ page }) => {
  await remember(page);
  await fakePosition(page, 16n, 100n, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, "/app/trade/btc");
  const btn = page.getByRole("button", { name: /Close BTC long position/ }).first();
  await expect(btn).toBeInViewport({ ratio: 0.5 }).catch(async () => btn.scrollIntoViewIfNeeded());
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Ready to close your BTC long/)).toBeVisible();
  await expect(page.getByLabel(/Reduce-only/)).toBeChecked();
});

test("closing from a flat desk says there is nothing to close", async ({ page }) => {
  await remember(page);
  await gotoReady(page, "/app/trade/btc?close=16&n=1");
  await expect(page.getByText("Nothing to close")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel(/Reduce-only/)).not.toBeChecked();
});

test("the Close position button is visible without horizontal scrolling on desktop", async ({ page }) => {
  await remember(page);
  await fakePosition(page, 16n, 100n, 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoReady(page, "/app/trade/btc");
  const btn = page.getByRole("button", { name: /Close BTC long position/ }).first();
  await expect(btn).toBeVisible({ timeout: 30_000 });
  // Scroll the PAGE vertically only; scrolling the table sideways would hide the original bug
  // (the Close link sat past the right edge of a wide table).
  const box0 = (await btn.boundingBox())!;
  await page.evaluate((y) => window.scrollBy(0, y - 200), box0.y);
  const box = (await btn.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.x, "left edge on screen").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "right edge on screen without horizontal scrolling").toBeLessThanOrEqual(vw);
  const scroller = await btn.evaluate((el) => {
    let a: HTMLElement | null = el.parentElement;
    while (a && getComputedStyle(a).overflowX === "visible") a = a.parentElement;
    return a ? { left: a.getBoundingClientRect().left, right: a.getBoundingClientRect().right, scrollLeft: a.scrollLeft } : null;
  });
  if (scroller) {
    expect(scroller.scrollLeft, "table not scrolled").toBe(0);
    expect(box.x + box.width, "inside the table's visible area").toBeLessThanOrEqual(scroller.right + 1);
  }
});

// A malformed or edited close link must never crash the terminal (it is ignored and removed).
for (const bad of ["abc", "", "-16", "1e3", "9".repeat(400), "99", "16.0"]) {
  test(`a malformed close link (${bad.slice(0, 12) || "empty"}) is ignored and the terminal stays usable`, async ({ page }) => {
    await remember(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/app/trade/btc?close=${encodeURIComponent(bad)}&n=1`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel(/^Size/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Something failed to load")).toHaveCount(0);
    await expect(page.getByText(/Ready to close/)).toHaveCount(0);
    await expect(page.getByLabel(/Reduce-only/)).not.toBeChecked();
    expect(errors.filter((m) => /BigInt/i.test(m))).toEqual([]);
  });
}
