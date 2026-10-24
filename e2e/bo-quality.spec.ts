import { expect, test } from "@playwright/test";
import { addExternalEnrollment, addTrainer, createJustEndedSession, createTraining } from "./support/db";

test("pedagogical follow-up: needs analysis, learning assessment, restricted adaptation need (D2, D5, D8)", async ({
  page,
}) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Suivi ${stamp}`);
  const sessionId = await createJustEndedSession(trainingId, `SUIVI-${stamp}`);
  await addExternalEnrollment(sessionId, {
    firstName: "Nora",
    lastName: `Suivi${stamp}`,
    email: `nora.${stamp}@e2e.example`,
  });

  await page.goto(`/admin/sessions/${sessionId}/inscrits`);
  await page.getByRole("row").filter({ hasText: "Nora" }).getByRole("button", { name: "Suivi" }).click();
  const dialog = page.getByRole("dialog", { name: /Suivi pédagogique de Nora/ });
  await dialog.getByRole("textbox", { name: "Recueil du besoin (entreprise ou stagiaire)" }).fill("Maîtriser les TCD");
  await dialog.getByRole("button", { name: "Enregistrer le besoin" }).click();
  await expect(dialog.getByText("Analyse du besoin enregistrée.")).toBeVisible();

  await dialog.getByRole("combobox", { name: "Résultat" }).selectOption("acquired");
  await dialog.getByRole("button", { name: "Enregistrer l'évaluation" }).click();
  await expect(dialog.getByText("Évaluation des acquis enregistrée.")).toBeVisible();

  await dialog.getByRole("button", { name: "Renseigner" }).click();
  await dialog.getByRole("textbox", { name: "Aménagement nécessaire" }).fill("Supports en gros caractères");
  await dialog.getByRole("button", { name: "Enregistrer l'aménagement" }).click();
  await expect(dialog.getByText("Besoin d'aménagement enregistré.")).toBeVisible();

  // The adaptation need never appears in the enrollment export.
  const csv = await page.request.get(`/admin/sessions/${sessionId}/inscrits/export`);
  expect(await csv.text()).not.toContain("gros caractères");
});

test("complaints and improvement registers (D10, D11)", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/admin/qualite/reclamations");
  await page.getByRole("textbox", { name: "Émetteur" }).fill("Société Cliente");
  await page.getByRole("textbox", { name: "Objet" }).fill(`Support manquant ${stamp}`);
  await page.getByRole("textbox", { name: "Description" }).fill("Le support n'a pas été envoyé.");
  await page.getByRole("button", { name: "Créer la réclamation" }).click();
  await expect(page.getByText("La réclamation a été enregistrée.")).toBeVisible();

  await page.getByRole("textbox", { name: "Action d'amélioration" }).fill(`Envoi automatique des supports ${stamp}`);
  await page.getByRole("button", { name: "Ajouter l'action" }).click();
  await expect(page.getByText("Action d'amélioration ajoutée.")).toBeVisible();

  await page.goto("/admin/qualite/ameliorations");
  await expect(page.locator("summary").filter({ hasText: `Envoi automatique des supports ${stamp}` })).toBeVisible();
  const csv = await page.request.get("/admin/qualite/reclamations/export");
  expect(await csv.text()).toContain(`Support manquant ${stamp}`);
  await page.goto("/admin/qualite/indicateurs");
  await expect(page.getByRole("link", { name: "Indicateurs (CSV)" })).toBeVisible();
});

test("trainer supporting documents and subcontracting contract (D7, D12)", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Justif ${stamp}`);
  const sessionId = await createJustEndedSession(trainingId, `JUST-${stamp}`);
  await addTrainer(sessionId, `justif.${stamp}@e2e.example`, `Justif${stamp}`);
  await page.goto("/admin/formateurs");
  await page.getByRole("link", { name: new RegExp(`Justif${stamp}`) }).click();
  await expect(page.getByText(/sans contrat de sous-traitance en vigueur/)).toBeVisible();
  await page.getByRole("combobox", { name: "Type" }).selectOption("subcontracting_contract");
  await page.getByRole("textbox", { name: "Intitulé" }).fill("Contrat 2026");
  await page.getByLabel("Date d'échéance").fill("2030-12-31");
  await page.getByLabel("Fichier").setInputFiles("e2e/fixtures/programme.pdf");
  await page.getByRole("button", { name: "Ajouter le justificatif" }).click();
  await expect(page.getByText("Justificatif ajouté.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Contrat 2026" })).toBeVisible();
  await expect(page.getByText(/sans contrat de sous-traitance en vigueur/)).toHaveCount(0);
});
