import { expect, test, type Page } from "@playwright/test";

const result = {
  project_id: "browser-smoke-project",
  score: 91,
  breakdown: { vegetation: 92, stability: 90, consistency: 91 },
  ndvi_series: [
    { date: "2023-01-01", value: 0.8 },
    { date: "2023-04-01", value: 0.82 },
    { date: "2024-01-01", value: 0.83 },
    { date: "2024-04-01", value: 0.84 }
  ],
  flags: ["The observations are from the local cached demo dataset."],
  evidence_hash: `0x${"1".repeat(64)}`,
  evidence_uri: "local://browser-smoke-evidence",
  explanation: "Cached demo data shows a strong vegetation signal.",
  status: "verified",
  tx_hash: null,
  data_source: "cached",
  confidence: "low"
};

async function mockLocalApi(page: Page) {
  await page.route("https://*.basemaps.cartocdn.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=",
        "base64"
      )
    })
  );
  await page.route("**/verify", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const body = request.postDataJSON() as { demo_scenario?: string };
    expect(body.demo_scenario).toBe("healthy");
    await route.fulfill({ status: 200, json: result });
  });
  await page.route("**/projects/browser-smoke-project", (route) =>
    route.fulfill({ status: 200, json: result })
  );
}

async function completeHealthyDemo(page: Page) {
  const styleViolations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("style-src")) {
      styleViolations.push(message.text());
    }
  });
  await mockLocalApi(page);
  await page.goto("/verify");
  await page.getByRole("button", { name: /Healthy forest/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Project details/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Reviewed cached sample satellite data will be used; bot verification is still required/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(page).toHaveURL(/\/projects\/browser-smoke-project$/);
  await expect(page.getByRole("heading", { name: "Healthy forest sample" })).toBeVisible();
  expect(styleViolations).toEqual([]);
}

test("production CSP keeps strict-dynamic without unsafe-eval", async ({ request }) => {
  const response = await request.get("/verify");
  expect(response.ok()).toBeTruthy();
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).toMatch(/style-src 'self' 'nonce-[^']+'/);
  expect(policy).toContain("style-src-attr 'unsafe-inline'");
  expect(policy).toContain("https://challenges.cloudflare.com");
  expect(policy).toContain("http://localhost:8000");
});

test("main verification flow works at a desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await completeHealthyDemo(page);
});

test("main verification flow works at a 360px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await completeHealthyDemo(page);
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});
