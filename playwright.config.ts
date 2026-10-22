import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
  },
  projects: [
    // Anonymous access checks, desktop and mobile.
    { name: "anonymous", testMatch: /access\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "anonymous-mobile", testMatch: /access\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "roles", testMatch: /roles\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "admin",
      testMatch: /bo-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    // Uploaded files go to .storage/ instead of Supabase during the tests.
    env: { ALLOW_LOCAL_STORAGE: "1" },
    url: `http://localhost:${PORT}/connexion`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
