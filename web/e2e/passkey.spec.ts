import { expect, test, type Page } from "@playwright/test";

/** Chrome's virtual authenticator via DevTools; `hasPrf` toggles WebAuthn PRF support. */
async function virtualAuthenticator(page: Page, hasPrf: boolean) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf,
    } as never,
  });
}

const ADDR = /0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/;

test("Mera passkey account: create, end session, sign in again to the same address", async ({ page }) => {
  await page.goto("/app");
  await virtualAuthenticator(page, true);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  const addrButton = page.getByRole("button", { name: ADDR });
  await expect(addrButton).toBeVisible({ timeout: 20_000 });
  const first = (await addrButton.innerText()).trim();
  await addrButton.click();
  await page.getByRole("menuitem", { name: /End session/ }).click();
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await expect(page.getByRole("button", { name: ADDR })).toHaveText(first, { timeout: 20_000 });
});

test("authenticator without PRF gets PRF_UNAVAILABLE and no account", async ({ page }) => {
  await page.goto("/app");
  await virtualAuthenticator(page, false);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  await expect(page.getByText("PRF_UNAVAILABLE").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: ADDR })).toHaveCount(0);
});

test("no development mock account outside the local network", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText("DEVELOPMENT MOCK")).toHaveCount(0);
});
