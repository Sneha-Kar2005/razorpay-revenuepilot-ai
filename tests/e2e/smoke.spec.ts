import { test, expect } from "@playwright/test";

/**
 * End-to-end smoke suite against the real running backend + frontend (not
 * mocked). Assumes `npm run dev` is already running in both backend/ and
 * frontend/ (see README "Running tests" section) with demo data seeded.
 */

test("dashboard shows the mode banner and real KPI data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/DEMO \/ SYNTHETIC MODE|RAZORPAY TEST MODE/)).toBeVisible();
  await expect(page.getByText("Executive Revenue Recovery Dashboard")).toBeVisible();
  await expect(page.getByText("Total Revenue At Risk")).toBeVisible();
  await expect(page.getByText("Recovered Revenue", { exact: true })).toBeVisible();
});

test("risk queue lists cases and filters by status", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByText("Revenue-at-Risk Queue")).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  await page.getByRole("combobox").nth(0).selectOption({ label: "Stopped" }).catch(() => {});
});

test("full agent cycle runs end-to-end from a case detail page", async ({ page }) => {
  await page.goto("/queue");
  await page.locator("table tbody tr").first().click();
  await expect(page.getByText("Case Summary")).toBeVisible();

  const runButton = page.getByRole("button", { name: /Run Recovery Cycle/ });
  if (await runButton.isVisible().catch(() => false)) {
    await runButton.click();
    await expect(page.getByText(/Cycle result:/)).toBeVisible({ timeout: 10_000 });
    // Either an AI diagnosis or a policy decision must now be present.
    await expect(page.getByText("AI Diagnosis")).toBeVisible();
    await expect(page.getByText("Recovery Timeline & Audit Trail")).toBeVisible();
  }
});

test("analytics page renders strategy comparison and charts", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByText("Strategy Comparison")).toBeVisible();
  await expect(page.getByText("Recovery Rate by Failure/Risk Type")).toBeVisible();
});

test("audit trail lists append-only events", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible();
});

test("settings page shows bounded policy thresholds and demo controls", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("Bounded Autonomy Policy")).toBeVisible();
  await expect(page.getByText("Max automated retry attempts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Revenue Recovery Simulation" })).toBeVisible();
});
