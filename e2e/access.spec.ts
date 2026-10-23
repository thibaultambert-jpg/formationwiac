import { expect, test } from "@playwright/test";

// Signed-in scenarios need a real Google account and are covered by the
// manual acceptance procedure (README). These tests cover anonymous access.

test("anonymous visitors are sent to the login page with a return URL", async ({ page }) => {
  await page.goto("/admin/sessions");
  await expect(page).toHaveURL(/\/connexion\?callbackUrl=%2Fadmin%2Fsessions$/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter avec Google" })).toBeVisible();
});

test("the front requires a login as well", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/connexion/);
});

test("the access denied page explains the domain restriction", async ({ page }) => {
  await page.goto("/acces-refuse?raison=domaine");
  await expect(page.getByRole("heading", { name: "Accès refusé" })).toBeVisible();
  await expect(page.getByText(/Seuls les comptes Google du domaine @/)).toBeVisible();
});

test("the Google button starts the OAuth flow restricted to the domain", async ({ page }) => {
  let authorizeUrl: URL | undefined;
  await page.route("https://accounts.google.com/**", async (route) => {
    authorizeUrl = new URL(route.request().url());
    await route.fulfill({ status: 200, body: "stub" });
  });

  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec Google" }).click();
  await expect.poll(() => authorizeUrl?.searchParams.get("hd")).toBe(process.env.ALLOWED_GOOGLE_DOMAIN);
});
