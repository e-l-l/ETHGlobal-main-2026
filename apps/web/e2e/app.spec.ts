import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* Every route in the app (see src/lib/routes.ts). */
const routes = [
  "/home",
  "/onboarding",
  "/onboarding/prove",
  "/onboarding/verifying",
  "/onboarding/pass",
  "/onboarding/failed?reason=suspended",
  "/onboarding/shop",
  "/merchant",
  "/merchant/advance",
  "/merchant/advance/arrived",
  "/merchant/week",
  "/merchant/agent",
  "/merchant/agent/manage",
  "/merchant/agent/setup",
  "/merchant/agent/approve",
  "/merchant/agent/denied",
  "/merchant/repaid",
  "/merchant/cash-out",
  "/merchant/qr",
  "/merchant/world-view",
  "/pay/corner-kiosk",
  "/pay/corner-kiosk/paid?amt=10.00&tok=USDT",
  "/portal/login",
  "/portal?acct=luna",
  "/earn",
  "/earn/deposit",
  "/earn/position",
  "/junior",
  "/junior/mint",
  "/junior/trade",
  "/protocol",
  "/risk",
  "/explorer",
  "/screens",
];

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

test.describe("every screen", () => {
  for (const path of routes) {
    test(`${path}: no sideways scroll, no serious axe issues, no errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(path);
      await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      expect(errors).toEqual([]);
      expect((await page.locator("body").innerText()).toLowerCase()).not.toContain("dollarjar");
    });
  }

  test("/ is reserved for the landing page", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
  });
});

test.describe("journeys", () => {
  test("the hub opens each role", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/home");
    await page.getByRole("link", { name: "Open the demo shop" }).click();
    await expect(page).toHaveURL(/\/merchant$/);
    await page.goto("/home");
    await page.getByRole("link", { name: "Start earning" }).click();
    await expect(page).toHaveURL(/\/earn$/);
  });

  test("a merchant signs up, sets up the agent and lands on the shop", async ({ page }) => {
    await page.goto("/onboarding/prove");
    await page.getByRole("link", { name: "Log in to seller portal" }).click();
    await page.getByRole("button", { name: "Log in as Luna" }).click();
    await page.getByRole("link", { name: "Share 4 facts privately" }).click();
    await expect(page).toHaveURL(/\/onboarding\/pass/, { timeout: 10000 });
    await page.getByRole("link", { name: "Create your shop" }).click();
    await expect(page).toHaveURL(/\/onboarding\/shop/);
    await page.getByRole("main").getByRole("link", { name: /agent/i }).first().click();
    await expect(page).toHaveURL(/\/merchant\/agent\/setup/);
    await page.getByRole("link", { name: "Approve with World" }).click();
    await expect(page).toHaveURL(/\/merchant\/agent\/approve/);
    await page.getByRole("link", { name: /approve/i }).first().click();
    await expect(page).toHaveURL(/\/merchant$/);
  });

  test("a suspended account lands on the failure screen", async ({ page }) => {
    await page.goto("/portal?acct=sur");
    await page.getByRole("link", { name: "Share 4 facts privately" }).click();
    await expect(page).toHaveURL(/failed\?reason=suspended/, { timeout: 10000 });
  });

  test("spanish is a setting that sticks", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "EN, cambiar a español" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dólares para el stock, hoy.");
    await page.goto("/onboarding/prove");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Demostrá");
  });

  test("world view follows you across screens", async ({ page }) => {
    await page.goto("/onboarding/pass");
    await page.getByRole("button", { name: "What the world sees" }).click();
    await expect(page.getByText("Onchain, anyone can see")).toBeVisible();
    await page.goto("/earn");
    await expect(page.getByRole("button", { name: "What the world sees" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/merchant");
    await expect(page.getByRole("button", { name: "What the world sees" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the customer pays with the keypad and never sees the advance", async ({ page }) => {
    await page.goto("/pay/corner-kiosk");
    expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(/advance|loan|repay|adelanto|debt/);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "4", exact: true }).click();
    await page.getByRole("button", { name: "Pay $4.00" }).click();
    await expect(page).toHaveURL(/paid\?amt=4\.00/);
    expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(/advance|loan|repay|adelanto|debt/);
  });

  test("deposit runs both wallet steps and offers the position", async ({ page }) => {
    await page.goto("/earn/deposit");
    await page.getByRole("button", { name: "Max" }).click();
    await page.getByRole("button", { name: "Approve USDC" }).click();
    await page.getByRole("button", { name: "Deposit", exact: true }).click({ timeout: 5000 });
    await expect(page.getByRole("link", { name: "See my position" })).toBeVisible({ timeout: 5000 });
  });

  test("every merchant screen is reachable from the dashboard", async ({ page }) => {
    await page.goto("/merchant");
    const hrefs = await page.locator("a[href^='/merchant']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
    for (const p of ["/merchant/agent", "/merchant/qr", "/merchant/cash-out", "/merchant/week", "/merchant/repaid", "/merchant/world-view"]) {
      expect(hrefs, p).toContain(p);
    }
  });
});
