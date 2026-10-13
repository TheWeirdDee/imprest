// Handoff test: open the live app in a recorded Chrome window with a dedicated profile, wait for the
// owner to sign in with their passkey (the OS passkey dialog is outside the page and not recorded),
// then confirm the signed-in address from the page itself.
const fs = require("fs");
const { chromium } = require(require.resolve("@playwright/test", { paths: ["C:/Users/DELL/Desktop/imprest/web"] }));
const [profile, out] = process.argv.slice(2);
const status = (o) => fs.writeFileSync(`${out}/status.json`, JSON.stringify({ at: new Date().toISOString(), ...o }, null, 1));
(async () => {
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chrome", headless: false, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5,
    recordVideo: { dir: out, size: { width: 1920, height: 1080 } }, args: ["--window-position=0,0"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://imprest-chi.vercel.app/app", { waitUntil: "domcontentloaded" });
  status({ state: "waiting-for-owner", url: page.url() });
  const end = Date.now() + 20 * 60_000;
  let account = null;
  while (Date.now() < end) {
    account = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("imprest.account.v1.testnet") || "null"); } catch { return null; } }).catch(() => null);
    if (account?.address) break;
    await page.waitForTimeout(2000);
  }
  if (!account?.address) { status({ state: "timed-out" }); await ctx.close(); return; }
  await page.waitForTimeout(4000);
  await page.goto("https://imprest-chi.vercel.app/app/risk", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/after-signin-risk.png` });
  status({ state: "signed-in", address: account.address, kind: account.kind, url: page.url() });
  await ctx.close();
})().catch((e) => { status({ state: "error", error: String(e) }); process.exit(1); });
