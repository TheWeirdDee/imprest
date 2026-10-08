import { expect, test } from "@playwright/test";

test("text is readable on every page (WCAG contrast at least 3:1)", async ({ page }) => {
  const mode = "light" as string;
  test.setTimeout(240_000);
  for (const path of [
    "/",
    "/app",
    "/app/trade/btc",
    "/app/positions",
    "/app/risk",
    "/app/claims",
    "/app/history",
    "/app/desk",
    "/proof",
    "/lp",
    "/docs",
    "/status",
  ]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const bad = await page.evaluate((mode) => {
      const out: string[] = [];
      // rgb()/rgba() report 0-255; color(srgb ...) reports 0-1. Other spaces are skipped.
      const parse = (c: string): number[] | null => {
        const n = c.match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.map(Number);
        if (!n || n.length < 3) return null;
        if (c.startsWith("color(srgb")) return [n[0]! * 255, n[1]! * 255, n[2]! * 255, n[3] ?? 1];
        if (c.startsWith("rgb")) return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
        return null;
      };
      const lum = (c: string) => {
        const m = parse(c);
        if (!m) return null;
        const [r, g, b, a] = m;
        if (a! < 0.5) return null;
        return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
      };
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const bg = lum(cs.backgroundColor);
        if (mode === "dark" && bg !== null && bg > 0.85 && el.tagName !== "CANVAS")
          out.push(`light panel ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`);
        if (el.children.length === 0 && (el.textContent ?? "").trim()) {
          // WCAG contrast of the text against the nearest opaque background behind it.
          const rel = (c: string) => {
            const m = parse(c) ?? [0, 0, 0];
            const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(m[0]!) + 0.7152 * f(m[1]!) + 0.0722 * f(m[2]!);
          };
          let a: Element | null = el;
          let bgc = mode === "dark" ? "rgb(13, 15, 18)" : "rgb(246, 245, 241)";
          while (a) {
            const c = getComputedStyle(a).backgroundColor;
            const pc = parse(c);
            if (pc && pc[3]! > 0.5) {
              bgc = c;
              break;
            }
            a = a.parentElement;
          }
          const L1 = rel(cs.color);
          const L2 = rel(bgc);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (ratio < 3 && !el.closest("[disabled],[aria-hidden=true]") && Number(cs.opacity) > 0.6) {
            out.push(`low contrast ${ratio.toFixed(2)} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
          }
        }
        if (out.length > 4) break;
      }
      return out;
    }, mode);
    expect(bad, `${path}: ${bad.join(" | ")}`).toEqual([]);
  }
});
