import { expect, test } from "@playwright/test";

test("legal texts, contacts and versioned internal regulations (E2, F1-F3)", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/admin/parametres/informations-legales");
  await page.getByRole("textbox", { name: "Référent handicap", exact: true }).fill(`Alex Référent ${stamp}`);
  await page.getByRole("textbox", { name: "Mention d'information courte" }).fill(`Mention validée ${stamp}.`);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Informations légales enregistrées.")).toBeVisible();

  await page.getByLabel("Règlement intérieur (PDF)").setInputFiles("e2e/fixtures/programme.pdf");
  await page.getByLabel("En vigueur à partir du").fill("2020-01-01");
  await page.getByRole("button", { name: "Ajouter une version" }).click();
  await expect(page.getByText(/Version \d+ du règlement intérieur enregistrée\./)).toBeVisible();

  const response = await page.request.get("/reglement-interieur/fichier");
  expect(response.headers()["content-type"]).toBe("application/pdf");
  await page.goto("/reglement-interieur");
  await expect(page.getByRole("link", { name: "Télécharger le règlement intérieur (PDF)" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByText(`Mention validée ${stamp}.`)).toBeVisible();
});

test("BPF page and exports are audited (B7, G2)", async ({ page }) => {
  await page.goto("/admin/bpf?annee=2026&internes=1");
  await expect(page.getByRole("heading", { name: "Bilan pédagogique et financier" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Inclure les collaborateurs internes" })).toBeChecked();
  const csv = await page.request.get("/admin/bpf/export?annee=2026&vue=detail");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Heures signées");
  await page.goto("/admin/parametres/journal?entite=bpf&action=export");
  await expect(page.getByText("Export · BPF").first()).toBeVisible();
});

test("retention durations and legal hold (E5)", async ({ page }) => {
  await page.goto("/admin/parametres/donnees");
  await page.getByRole("spinbutton", { name: "Traces techniques (IP, navigateur) : mois" }).fill("12");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Durées de conservation enregistrées.")).toBeVisible();
  await page.getByRole("button", { name: "Purger maintenant" }).click();
  await expect(page.getByText(/trace\(s\) technique\(s\) effacée\(s\)/)).toBeVisible();
});
