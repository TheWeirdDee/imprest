// Records genuine footage of the deployed Imprest site for the demo videos.
// Read-only: the owner's account is loaded by its PUBLIC address (the site's remembered, locked
// session), so every page shows the real desk without a passkey. Nothing is signed or sent.
// Each clip is one page recording (1920x1080) plus a marks file (times and element boxes) that the
// Remotion edit uses for zooms and highlights. A drawn cursor shows where the scripted pointer is.
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("@playwright/test", { paths: ["C:/Users/DELL/Desktop/imprest/web"] }));

const SITE = "https://imprest-chi.vercel.app";
const OWNER = "0x976C766eC9D72D6a23bdcf923e8E138113cF25fE";
const OUT = path.resolve(__dirname, "clips");
const PROFILE = path.resolve(__dirname, "profile-owner");
const SCALE = 1.5; // 1280x720 CSS viewport -> 1920x1080 video
const only = process.argv.slice(2);

const CURSOR = `
(() => {
  const add = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);transition:transform 40ms linear";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.5 L14.2 20.3 L11.1 13.8 L17.5 13.8 Z" fill="#111" stroke="#fff" stroke-width="1.4"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;width:36px;height:36px;border-radius:50%;border:3px solid #16181c;left:" + (e.clientX - 18) + "px;top:" + (e.clientY - 18) + "px;opacity:.9;transition:all 450ms ease-out";
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", add); else add();
})();`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: SCALE,
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    args: ["--window-position=0,0", "--hide-scrollbars"],
  });
  await ctx.addInitScript((a) => localStorage.setItem("imprest.account.v1.testnet", JSON.stringify({ address: a, kind: "mera" })), OWNER);
  await ctx.addInitScript(CURSOR);
  // Keep the first tab open (closing it would close the window); its recording is discarded.
  const holder = ctx.pages()[0] ?? (await ctx.newPage());

  const clips = {
    hook: async (c) => {
      await c.go("/");
      await c.waitText(/BTC-PERP/, 20000);
      await c.wait(6000); // live chart and rules fill in
      await c.mark("hero", "h1");
      await c.moveTo("main h1", 0.6);
      await c.wait(9000);
      await c.moveToText(/Enforced on every order/i);
      await c.wait(7000);
      await c.scroll(620, 6000);
      await c.markText("how", /How it works/i);
      await c.wait(8000);
      await c.scroll(-620, 4000);
      await c.moveTo("text=Open app", 0.2);
      await c.wait(9000);
    },
    dashboard: async (c) => {
      await c.go("/app");
      await c.wait(9000);
      await c.mark("top", "main");
      await c.moveTo("main h1", 0.5);
      await c.wait(2500);
      await c.scroll(450, 3500);
      await c.mark("mid", "main");
      await c.wait(2500);
      await c.scroll(450, 3500);
      await c.wait(2500);
    },
    desk: async (c) => {
      await c.go("/app/desk");
      await c.wait(9000);
      await c.mark("top", "main");
      await c.markText("graduation", /graduat/i);
      await c.wait(2500);
      await c.scroll(400, 3500);
      await c.markText("requirements", /closed trade|round trip|\+2%|target/i);
      await c.wait(3000);
      await c.scroll(400, 3500);
      await c.wait(2500);
    },
    risk: async (c) => {
      await c.go("/app/risk");
      await c.wait(9000);
      await c.markText("buffer", /How close am I to losing my desk/i);
      await c.moveToText(/How close am I/i);
      await c.wait(6000);
      await c.moveToText(/above the nearest limit/i);
      await c.wait(7000);
      await c.markNow("scroll1");
      await c.scroll(380, 4000);
      await c.markText("leverage", /Leverage and exposure/i);
      await c.moveToText(/Effective leverage/i);
      await c.wait(4000);
      await c.moveToText(/Restricted credit/i);
      await c.wait(4000);
      await c.scroll(380, 4000);
      await c.markText("pool", /Pool exposure/i);
      await c.wait(3000);
    },    trade: async (c) => {
      await c.go("/app/trade/btc");
      await c.waitText(/Policy check/i, 30000);
      await c.wait(7000);
      await c.mark("market", "main");
      await c.markText("ticket", /Limit price/i);
      await c.moveToText(/Size \(BTC\)/i);
      await c.wait(2500);
      await c.scrollTo(/Policy check/i, 2500);
      await c.markText("policy", /Policy check/i);
      await c.wait(2500);
      // Show the rules refusing an over-limit order: drag leverage to 6x (nothing is sent).
      await c.scrollTo(/Leverage/i, 2000);
      const s = await c.page.locator('input[type="range"]').first().boundingBox();
      if (s) {
        const at = (v) => s.x + ((v - 1) / 9) * s.width;
        await c.page.mouse.move(at(3), s.y + s.height / 2, { steps: 20 });
        await c.wait(600);
        await c.page.mouse.down();
        await c.page.mouse.move(at(6), s.y + s.height / 2, { steps: 30 });
        await c.page.mouse.up();
        await c.markNow("lev6");
        await c.wait(1500);
        await c.scrollTo(/Policy check/i, 2000);
        await c.markText("blocked", /Policy check/i);
        await c.wait(4500);
        await c.scrollTo(/Leverage/i, 2000);
        const s2 = await c.page.locator('input[type="range"]').first().boundingBox();
        if (s2) {
          const at2 = (v) => s2.x + ((v - 1) / 9) * s2.width;
          await c.page.mouse.move(at2(6), s2.y + s2.height / 2, { steps: 15 });
          await c.page.mouse.down();
          await c.page.mouse.move(at2(3), s2.y + s2.height / 2, { steps: 25 });
          await c.page.mouse.up();
        }
        await c.markNow("lev3");
        await c.wait(1500);
      }
      await c.scrollTo(/Submit via/i, 2000);
      await c.markText("route", /Submit via/i);
      await c.moveToText(/Relayer \(signed intent\)/i);
      await c.wait(3500);
    },
    positions: async (c) => {
      await c.go("/app/positions");
      await c.wait(9000);
      await c.mark("top", "main");
      await c.wait(2000);
      const fills = c.page.getByRole("tab", { name: /fills/i }).first();
      if (await fills.isVisible().catch(() => false)) {
        await c.moveTo(fills, 0.5);
        await c.click(fills);
        await c.wait(4000);
        await c.markNow("fills");
      }
      await c.wait(3000);
    },
    receipt: async (c) => {
      // Explorer page of the owner's gasless browser trade (relayer paid gas), 2026-10-13.
      await c.page.goto("https://testnet.monadscan.com/tx/0xc29c4b1fce736f4a00d98c0ef51a2552e35970fade0639a95860e92c19635cec", { waitUntil: "domcontentloaded" });
      c.t0b = Date.now();
      await c.wait(9000);
      await c.mark("tx", "body");
      await c.scroll(300, 3000);
      await c.wait(3000);
    },
    claims: async (c) => {
      await c.go("/app/claims");
      await c.wait(9000);
      await c.markText("preview", /Claim preview|If you claim now/i);
      await c.markText("eligibility", /^Eligibility$/i);
      await c.moveToText(/Realized profit above HWM/i);
      await c.wait(3500);
      await c.moveToText(/Realized equity must rise|not above the high-water mark/i);
      await c.markText("why", /Realized equity must rise|not above the high-water mark/i);
      await c.wait(4000);
      await c.scroll(300, 2500);
      await c.wait(2500);
    },
    lp: async (c) => {
      await c.go("/lp");
      await c.waitText(/Total pool assets/i, 30000);
      await c.wait(9000);
      await c.markText("badge", /pool totals confirmed|single RPC|disagrees/i);
      await c.markText("tiles", /Total pool assets/i);
      await c.moveToText(/Total pool assets/i);
      await c.wait(4000);
      await c.moveToText(/Principal at risk/i);
      await c.wait(3500);
      await c.scrollTo(/Gross funded exposure by market/i, 3000);
      await c.markText("exposure", /Gross funded exposure by market/i);
      await c.wait(5000);
      await c.scrollTo(/^Desks \(/i, 3000);
      await c.markText("desks", /^Desks \(/i);
      await c.wait(6000);
      await c.scroll(300, 3000);
      await c.wait(4000);
    },
  };

  for (const [name, run] of Object.entries(clips)) {
    if (only.length && !only.includes(name)) continue;
    const page = await ctx.newPage();
    const c = makeClip(page);
    try {
      await run(c);
    } catch (e) {
      c.marks.push({ t: c.now(), label: "error", note: String(e).slice(0, 200) });
      console.error(name, String(e).slice(0, 200));
    }
    const dur = c.now();
    await page.close();
    const file = path.join(OUT, `${name}.webm`);
    await page.video().saveAs(file);
    await page.video().delete().catch(() => {});
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ clip: name, captured: new Date().toISOString(), duration: dur, marks: c.marks }, null, 1));
    console.log(`${name}: ${(dur / 1000).toFixed(1)} s, ${c.marks.length} marks`);
  }
  await holder.close().catch(() => {});
  await ctx.close();
  for (const f of fs.readdirSync(OUT)) if (/^page@.*\.webm$/.test(f)) fs.rmSync(path.join(OUT, f));
}

function makeClip(page) {
  const t0 = Date.now();
  const c = {
    page,
    marks: [],
    now: () => Date.now() - t0,
    wait: (ms) => page.waitForTimeout(ms),
    go: (p) => page.goto(SITE + p, { waitUntil: "domcontentloaded" }),
    waitText: (re, ms) => page.getByText(re).first().waitFor({ state: "visible", timeout: ms }).catch(() => {}),
    async boxOf(loc) {
      const b = await loc.boundingBox().catch(() => null);
      return b ? { x: b.x * SCALE, y: b.y * SCALE, w: b.width * SCALE, h: b.height * SCALE } : null;
    },
    async mark(label, sel) {
      c.marks.push({ t: c.now(), label, box: await c.boxOf(page.locator(sel).first()) });
    },
    async markText(label, re) {
      const loc = page.getByText(re).first();
      // A card's box is more useful than the heading's: use the nearest card-like ancestor.
      const card = loc.locator("xpath=ancestor::*[contains(@class,'rounded') and contains(@class,'border')][1]");
      const box = (await c.boxOf(card)) ?? (await c.boxOf(loc));
      c.marks.push({ t: c.now(), label, box, text: String(re) });
    },
    markNow(label) {
      c.marks.push({ t: c.now(), label });
    },
    async moveTo(target, frac = 0.5) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      const b = await loc.boundingBox().catch(() => null);
      if (b) await page.mouse.move(b.x + b.width * frac, b.y + b.height / 2, { steps: 30 });
    },
    async moveToText(re) {
      await c.moveTo(page.getByText(re).first(), 0.3);
    },
    async click(loc) {
      await loc.click().catch(() => {});
    },
    async scroll(dy, ms) {
      const steps = 30;
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await page.waitForTimeout(ms / steps);
      }
    },
    async scrollTo(re, ms) {
      const loc = page.getByText(re).first();
      const b = await loc.boundingBox().catch(() => null);
      if (!b) return;
      const dy = b.y - 140;
      if (Math.abs(dy) > 8) await c.scroll(dy, ms);
    },
  };
  return c;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
