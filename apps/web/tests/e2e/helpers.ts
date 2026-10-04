import { expect, type Page } from "@playwright/test";

export async function signInAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForURL(/\/app$/);
}

export async function resetDemo(page: Page) {
  await signInAs(page, "Maya Okafor");
  await page.goto("/app/settings/organization");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Reset demo data/ }).click();
  await page.waitForURL(/\/login/, { timeout: 60_000 });
}

export async function openFlagship(page: Page) {
  await page.goto("/app/roles");
  await page.getByRole("link", { name: "Founding Full-Stack AI Engineer" }).click();
  await page.waitForURL(/\/matches$/);
  await expect(page.getByRole("heading", { name: "Founding Full-Stack AI Engineer" })).toBeVisible();
}
