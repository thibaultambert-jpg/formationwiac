import { expect, test } from "@playwright/test";

test.describe("collaborator", () => {
  test.use({ storageState: "e2e/.auth/employee.json" });

  test("reaches the front but not the back-office", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Catalogue des formations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Accès interdit" })).toBeVisible();
  });
});

test.describe("administrator", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("reaches the back-office", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation du back-office" })).toBeVisible();
  });
});
