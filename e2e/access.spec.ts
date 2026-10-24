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

test("the legal pages are public, linked from the login page (F1, F2, F3)", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByRole("link", { name: "Confidentialité" }).click();
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Durées de conservation" })).toBeVisible();
  await page.goto("/mentions-legales");
  await expect(page.getByRole("heading", { name: "Mentions légales" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hébergement" })).toBeVisible();
  await page.goto("/reglement-interieur");
  await expect(page.getByRole("heading", { name: "Règlement intérieur" })).toBeVisible();
  // Short GDPR notice in the footer of the public pages (E2)
  // (its text is editable in the settings, so only its presence is checked here).
  await expect(page.locator('[data-slot="privacy-notice"]')).not.toBeEmpty();
});

test("responses carry the security headers (E7)", async ({ request }) => {
  const response = await request.get("/connexion");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
});
