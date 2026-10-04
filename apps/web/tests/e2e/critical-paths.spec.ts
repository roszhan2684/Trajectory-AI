import { expect, test } from "@playwright/test";
import { openFlagship, resetDemo, signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetDemo(page);
  await page.close();
});

test("1 · signup creates an organization", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Work email").fill(`e2e+${Date.now()}@example.com`);
  await page.getByLabel("Organization").fill("E2E Labs");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(/\/app\/roles\/new/);
  await expect(page.getByRole("heading", { name: /Welcome to E2E Labs/ })).toBeVisible();
});

test("2 · role from brief → review parsed requirements → activate → ranked matches", async ({ page }) => {
  await signInAs(page, "Jordan Reyes");
  await page.goto("/app/roles/new");
  await page.getByRole("button", { name: /Founding full-stack \(demo script\)/ }).click();
  await page.getByRole("button", { name: "Parse brief" }).click();
  await expect(page.getByText(/Must have · /).first()).toBeVisible();
  await expect(page.getByText("TypeScript").first()).toBeVisible();
  await expect(page.getByText(/Needs clarification · /).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve & activate" }).click();
  await page.waitForURL(/\/matches/, { timeout: 60_000 });
  await expect(page.getByText(/hybrid retrieval/).first()).toBeVisible();
  await expect(page.getByText("#1", { exact: true }).first()).toBeVisible();
});

test("3+4 · ranked list → evidence → why not 100", async ({ page }) => {
  await signInAs(page, "Jordan Reyes");
  await openFlagship(page);
  await page.getByRole("link", { name: "Why?" }).first().click();
  await expect(page.getByText("Why this match?").first()).toBeVisible();
  await expect(page.getByText("Why not 100?").first()).toBeVisible();
  await expect(page.getByText(/What would change the score\?/).first()).toBeVisible();
  await page
    .getByRole("button", { name: /Open evidence/ })
    .first()
    .click();
  await expect(page.getByText(/Source excerpt/).first()).toBeVisible();
  await expect(page.locator("mark.evidence").first()).toBeVisible();
});

test("5 · feedback → reviewable proposal → re-rank with before/after", async ({ page }) => {
  await signInAs(page, "Jordan Reyes");
  await openFlagship(page);
  await page.getByRole("button", { name: "Refine ranking" }).click();
  await page
    .getByLabel("Ranking feedback")
    .fill(
      "These candidates feel too enterprise. Prioritize people who independently shipped products in teams under 30.",
    );
  await page.getByRole("button", { name: "Interpret feedback" }).click();
  await expect(page.getByText("Enterprise-only background").first()).toBeVisible();
  await expect(page.getByText("Independently shipped products").first()).toBeVisible();
  await page.getByRole("button", { name: "Apply & re-rank" }).click();
  await expect(page.getByText(/Before → after/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Noor Haddad/).first()).toBeVisible();
});

test("protected-trait feedback is refused", async ({ page }) => {
  await signInAs(page, "Jordan Reyes");
  await openFlagship(page);
  await page.getByRole("button", { name: "Refine ranking" }).click();
  await page.getByLabel("Ranking feedback").fill("Prioritize younger engineers.");
  await page.getByRole("button", { name: "Interpret feedback" }).click();
  await expect(page.getByText(/protected characteristic/).first()).toBeVisible();
});

test("6 · qualification question → candidate portal answer → score update", async ({ page, context }) => {
  await signInAs(page, "Jordan Reyes");
  await openFlagship(page);
  await page.getByRole("link", { name: "Noor Haddad" }).click();
  await page.getByRole("button", { name: /Ask \d question/ }).click();
  await page.getByRole("tab", { name: /Conversation/ }).click();
  const [portal] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /Open candidate portal/ }).click(),
  ]);
  await portal.waitForLoadState();
  await expect(portal.getByText(/quick question/).first()).toBeVisible();
  await portal.getByRole("button", { name: "Yes", exact: true }).first().click();
  await expect(portal.getByText(/recorded as evidence from you/).first()).toBeVisible({ timeout: 30_000 });
});

test("7 · request intro → candidate consent → recruiter approval → sent (demo)", async ({
  page,
  context,
}) => {
  await signInAs(page, "Jordan Reyes");
  await page.goto("/app/intros");
  await page.getByRole("button", { name: /Leila Farahani/ }).click();
  const [portal] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /open candidate portal/i }).click(),
  ]);
  await portal.getByRole("button", { name: "Yes, introduce me" }).click();
  await expect(portal.getByText(/Consent recorded/).first()).toBeVisible();
  await page.goto("/app/intros");
  await page.getByRole("button", { name: /Leila Farahani/ }).click();
  await page.getByRole("button", { name: "Approve introduction" }).click();
  await page.getByRole("button", { name: /Leila Farahani/ }).click();
  await page.getByRole("button", { name: /Mark as sent/ }).click();
  await expect(page.getByText("sent (demo)").first()).toBeVisible();
});

test("8 · run eval suite → results", async ({ page }) => {
  await signInAs(page, "Maya Okafor");
  await page.goto("/app/evals");
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(page.getByText(/NDCG@10 0\.\d+ · P@5/).first()).toBeVisible({ timeout: 60_000 });
});

test("RBAC · viewer cannot refine or request intros", async ({ page }) => {
  await signInAs(page, "Sam Whitfield");
  await openFlagship(page);
  await expect(page.getByRole("button", { name: "Refine ranking" })).toHaveCount(0);
  await page.getByRole("link", { name: "Why?" }).first().click();
  await expect(page.getByRole("button", { name: "Request intro" })).toHaveCount(0);
});

test("tenant isolation · Helix admin cannot open a Northstar role by URL", async ({ page }) => {
  await signInAs(page, "Daniel Kim");
  const res = await page.goto("/app/roles/role_0001/matches");
  expect(res?.status()).toBe(404);
  const api = await page.request.get("/api/v1/roles/role_0001");
  expect(api.status()).toBe(404);
});
