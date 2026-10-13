const { chromium } = require(require.resolve("@playwright/test", { paths: ["C:/Users/DELL/Desktop/imprest/web"] }));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-position=0,0"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, recordVideo: { dir: process.argv[2], size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  await page.goto("https://imprest-chi.vercel.app/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1500);
  await ctx.close(); await browser.close();
  console.log("done");
})();
