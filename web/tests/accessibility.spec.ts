import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const result = {
  project_id: "project-a11y-sample",
  score: 86,
  breakdown: { vegetation: 90, stability: 82, consistency: 85 },
  ndvi_series: [
    { date: "2023-01-01", value: 0.61 },
    { date: "2023-04-01", value: 0.65 },
    { date: "2023-07-01", value: 0.67 },
    { date: "2023-10-01", value: 0.64 }
  ],
  flags: ["Seasonality can affect observations."],
  evidence_hash: "0x1234abcd",
  evidence_uri: "ipfs://bafy-example",
  explanation: "The available observations show a consistent vegetation signal.",
  status: "verified",
  tx_hash: "0xabcdef1234",
  data_source: "live",
  confidence: "high"
};

const samplePolygon = {
  type: "Feature",
  properties: { name: "Local sample" },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [30, 10],
      [30.006, 10],
      [30.006, 10.006],
      [30, 10.006],
      [30, 10]
    ]]
  }
};

async function mockApi(page: import("@playwright/test").Page) {
  await page.route("**/stats", (route) =>
    route.fulfill({ json: { verified_count: 1, credits_minted: 38, duplicates_blocked: 2 } })
  );
  await page.route(/\/projects\?/, (route) =>
    route.fulfill({ json: { projects: [result], limit: 20, offset: 0, total: 1 } })
  );
  await page.route("**/projects/project-a11y-sample", (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    return route.fulfill({ json: result });
  });
}

async function expectNoA11yViolations(page: import("@playwright/test").Page, routePath: string) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(scan.violations, `${routePath}: ${JSON.stringify(scan.violations, null, 2)}`).toEqual([]);
}

test("all public pages meet WCAG 2.2 AA axe checks at 360px", async ({ page }) => {
  test.setTimeout(120_000);
  await mockApi(page);
  await page.addInitScript(({ key, metadata }) => {
    window.localStorage.setItem(key, JSON.stringify({ "project-a11y-sample": metadata }));
  }, {
    key: "carbonlens.project-metadata.v1",
    metadata: { name: "Local sample", claimed_hectares: 40, geojson: samplePolygon }
  });

  const routes = [
    "/",
    "/projects",
    "/projects/project-a11y-sample",
    "/trust",
    "/security",
    "/privacy",
    "/responsible-ai",
    "/design",
    "/not-a-real-page"
  ];

  for (const routePath of routes) {
    await page.goto(routePath);
    await expect(page.locator("#main-content")).toBeVisible();
    const pageWidth = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));
    expect(pageWidth.content, `${routePath} overflows at 360px`).toBeLessThanOrEqual(pageWidth.viewport);
    if (routePath === "/projects") {
      await expect(page.getByRole("link", { name: /Local sample/ })).toBeVisible();
    }
    if (routePath === "/projects/project-a11y-sample") {
      await expect(page.getByRole("heading", { name: "Local sample" })).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Map showing the submitted project polygon" })
      ).toBeVisible();
    }
    await expectNoA11yViolations(page, routePath);
  }
});

test("the guided verification steps meet WCAG 2.2 AA checks", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("pageerror", (error) => console.error("Browser page error:", error.message));
  await mockApi(page);
  await page.goto("/verify");

  await expectNoA11yViolations(page, "/verify · location");
  await page.getByRole("button", { name: /Healthy forest/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Project details/ })).toBeVisible();
  await expectNoA11yViolations(page, "/verify · details");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Bot check and submit/ })).toBeVisible();
  await expectNoA11yViolations(page, "/verify · bot check");
});

test("verification location selection and navigation work with a keyboard", async ({ page }) => {
  await page.goto("/verify");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Healthy forest/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Project details/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Project details/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Keyboard Forest");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("41");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Bot check and submit/ })).toBeVisible();
});

test("toast notifications are accessible without CSP style violations", async ({ page }) => {
  const styleViolations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("style-src")) {
      styleViolations.push(message.text());
    }
  });

  await page.goto("/design");
  await page.getByRole("button", { name: "Show toast" }).click();
  await expect(page.getByRole("status").getByText("Your preferences are saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss notification" })).toBeVisible();
  await expectNoA11yViolations(page, "/design · toast");
  expect(styleViolations).toEqual([]);
});
