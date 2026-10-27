import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addExternalEnrollment, createJustEndedSession, createTraining, withDb } from "./support/db";

// Automated accessibility audit (H2): WCAG 2.1 A and AA rules of axe-core on the
// main screens. A manual RGAA audit is still needed for full compliance.
const PAGES = [
  "/",
  "/mes-formations",
  "/admin",
  "/admin/sessions",
  "/admin/formations",
  "/admin/formateurs",
  "/admin/entreprises",
  "/admin/bpf",
  "/admin/qualite/indicateurs",
  "/admin/qualite/reclamations",
  "/admin/parametres/organisme",
  "/admin/parametres/donnees",
  "/admin/parametres/informations-legales",
  "/confidentialite",
  "/mentions-legales",
];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  // The audit did run: rules were checked on the page.
  expect(results.passes.length).toBeGreaterThan(10);
  const summary = results.violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

for (const path of PAGES) {
  test(`no WCAG A/AA violation on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expectAccessible(page);
  });
}

test("no WCAG A/AA violation on the session screens", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`A11y ${stamp}`);
  const sessionId = await createJustEndedSession(trainingId, `A11Y-${stamp}`);
  await addExternalEnrollment(sessionId, {
    firstName: "Ava",
    lastName: `A11y${stamp}`,
    email: `ava.${stamp}@e2e.example`,
  });
  for (const tab of ["", "/inscrits", "/emargement", "/documents", "/evaluations", "/conformite", "/facturation"]) {
    await page.goto(`/admin/sessions/${sessionId}${tab}`);
    await expectAccessible(page);
  }
  // The pedagogical follow-up dialog as well.
  await page.goto(`/admin/sessions/${sessionId}/inscrits`);
  await page.getByRole("row").filter({ hasText: "Ava" }).getByRole("button", { name: "Suivi" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectAccessible(page);
});

test("no WCAG A/AA violation on the invoicing screen of a closed session", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`A11y facturation ${stamp}`);
  const sessionId = await createJustEndedSession(trainingId, `A11Y-FAC-${stamp}`);
  await addExternalEnrollment(sessionId, {
    firstName: "Ivo",
    lastName: `Facture${stamp}`,
    email: `ivo.${stamp}@e2e.example`,
  });
  await withDb(async (client) => {
    await client.query(`UPDATE enrollments SET status = 'present', applied_price = 950 WHERE session_id = $1`, [
      sessionId,
    ]);
    await client.query(`UPDATE sessions SET status = 'completed' WHERE id = $1`, [sessionId]);
  });
  await page.goto(`/admin/sessions/${sessionId}/facturation`);
  await expect(page.getByRole("heading", { name: `Société Facture${stamp}` })).toBeVisible();
  await expectAccessible(page);
});
