import { expect, test, type Page } from "@playwright/test";

/** Chrome's virtual authenticator via DevTools; `hasPrf` toggles WebAuthn PRF support. */
async function virtualAuthenticator(page: Page, hasPrf: boolean) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = (await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf,
    } as never,
  })) as { authenticatorId: string };
  return { cdp, authenticatorId };
}

/** The header account button; its accessible name carries the full address. */
const account = (page: Page) => page.getByRole("button", { name: /^Account 0x[0-9a-fA-F]{40}/ });
const signInButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Sign in$/ });

test("Mera passkey account: create, sign out, sign in again to the same address", async ({ page }) => {
  await page.goto("/app");
  await virtualAuthenticator(page, true);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  await expect(account(page)).toBeVisible({ timeout: 20_000 });
  const first = await account(page).getAttribute("aria-label");
  await account(page).click();
  await page.getByRole("menuitem", { name: /Sign out on this device/ }).click();
  await expect(signInButton(page)).toBeVisible();
  await signInButton(page).click();
  await expect(account(page)).toHaveAttribute("aria-label", first!, { timeout: 20_000 });
});

test("session survives navigation, direct URLs, reload, a new tab, theme and viewport changes", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto("/app");
  await virtualAuthenticator(page, true);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  await expect(account(page)).toBeVisible({ timeout: 20_000 });
  const who = (await account(page).getAttribute("aria-label"))!.match(/0x[0-9a-fA-F]{40}/)![0];
  const stillSignedIn = async (p: Page, where: string) => {
    await expect(account(p), `signed out at ${where}`).toBeVisible({ timeout: 15_000 });
    await expect(account(p)).toHaveAttribute("aria-label", new RegExp(who));
    await expect(signInButton(p), `sign-in shown at ${where}`).toHaveCount(0);
  };

  // 1. Client-side navigation through every app page via the sidebar.
  for (const label of ["Trade", "Positions", "Risk", "Desk & graduation", "History", "Claims", "My receipts", "Dashboard"]) {
    await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: label, exact: true }).click();
    await stillSignedIn(page, `nav ${label}`);
  }
  // 2. Out to the public pages and back.
  for (const label of ["LP console", "Proof", "Docs", "Status"]) {
    await page.goto("/app");
    await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: label }).click();
    await page.waitForLoadState("domcontentloaded");
  }
  // 3. Direct URL loads (full page loads) of every route.
  for (const path of ["/app", "/app/trade/btc", "/app/positions", "/app/risk", "/app/desk", "/app/history", "/app/claims", "/app/proof", "/lp", "/app"]) {
    await page.goto(path);
    if (path.startsWith("/app")) await stillSignedIn(page, `direct ${path}`);
  }
  // 4. Reload.
  await page.reload();
  await stillSignedIn(page, "reload");
  // 5. A new tab in the same browser profile.
  const tab = await context.newPage();
  await tab.goto("/app/claims");
  await stillSignedIn(tab, "new tab");
  await tab.close();
  // 6. Theme switch does not touch the session.
  await page.getByRole("radio", { name: "Dark theme" }).click();
  await stillSignedIn(page, "theme dark");
  await page.getByRole("radio", { name: "Light theme" }).click();
  // 7. Phone width and back.
  await page.setViewportSize({ width: 375, height: 800 });
  await stillSignedIn(page, "375px");
  await page.setViewportSize({ width: 1280, height: 900 });
  await stillSignedIn(page, "1280px");
});

test("after a reload the account is locked, not signed out, and the passkey unlocks signing once", async ({ page }) => {
  await page.goto("/app");
  await virtualAuthenticator(page, true);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  await expect(account(page)).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(account(page)).toHaveAttribute("aria-label", /signing locked/);
  await account(page).click();
  await page.getByRole("menuitem", { name: /Unlock signing now/ }).click();
  await expect(account(page)).not.toHaveAttribute("aria-label", /signing locked/, { timeout: 20_000 });
});

test("a cancelled passkey prompt never signs the user out", async ({ page }) => {
  await page.goto("/app");
  const { cdp, authenticatorId } = await virtualAuthenticator(page, true);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  await expect(account(page)).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(account(page)).toHaveAttribute("aria-label", /signing locked/);
  // Remove the authenticator so the unlock prompt fails.
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await account(page).click();
  await page.getByRole("menuitem", { name: /Unlock signing now/ }).click();
  await page.waitForTimeout(3000);
  await expect(account(page)).toBeVisible();
  await expect(signInButton(page)).toHaveCount(0);
});

test("authenticator without PRF gets PRF_UNAVAILABLE and no account", async ({ page }) => {
  await page.goto("/app");
  await virtualAuthenticator(page, false);
  await page.getByRole("button", { name: /Create passkey/ }).first().click();
  await expect(page.getByText("PRF_UNAVAILABLE").first()).toBeVisible({ timeout: 20_000 });
  await expect(account(page)).toHaveCount(0);
});

test("no development mock account outside the local network", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText(/DEV(ELOPMENT)? MOCK/)).toHaveCount(0);
});
