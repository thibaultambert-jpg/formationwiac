import { expect, test } from "@playwright/test";
import { createTraining } from "./support/db";
import { createSessionViaUi, isoDate } from "./support/session";

test("GDPR: export and anonymize an external participant", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`RGPD ${stamp}`);
  const sessionId = await createSessionViaUi(page, { trainingId, date: isoDate(100) });

  await page.goto(`/admin/sessions/${sessionId}/inscrits`);
  await page.getByRole("button", { name: "Ajouter un externe" }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter un participant externe" });
  await dialog.getByRole("radio", { name: "Nouvelle" }).click();
  await dialog.getByRole("textbox", { name: "Raison sociale", exact: true }).fill(`RGPD Corp ${stamp}`);
  await dialog.getByRole("textbox", { name: "Prénom", exact: true }).fill("Romane");
  await dialog.getByRole("textbox", { name: "Nom", exact: true }).fill(`Oubli${stamp}`);
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(`romane.${stamp}@rgpd.example`);
  await dialog.getByRole("button", { name: "Inscrire" }).click();
  await expect(dialog.getByText(/est inscrit\(e\)/)).toBeVisible();
  await dialog.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("link", { name: `Romane Oubli${stamp}` }).click();
  await expect(page).toHaveURL(/\/admin\/entreprises\/participants\/[0-9a-f-]+$/);
  const exportResponse = await page.request.get(`${new URL(page.url()).pathname}/export`);
  const data = await exportResponse.json();
  expect(data.participant.email).toBe(`romane.${stamp}@rgpd.example`);
  expect(data.enrollments).toHaveLength(1);

  await page.getByRole("button", { name: "Anonymiser" }).click();
  const confirm = page.getByRole("dialog", { name: /Anonymiser Romane/ });
  await confirm.getByRole("textbox", { name: "Origine de la demande" }).fill("Demande par email");
  await confirm.getByRole("textbox", { name: "Saisissez ANONYMISER pour confirmer" }).fill("ANONYMISER");
  await confirm.getByRole("button", { name: "Anonymiser définitivement" }).click();
  await expect(page.getByRole("heading", { name: "Participant anonymisé" })).toBeVisible();
  await expect(page.getByText(`romane.${stamp}@rgpd.example`)).toHaveCount(0);

  // The enrollment is kept, without identity.
  await page.goto(`/admin/sessions/${sessionId}/inscrits`);
  await expect(page.getByRole("row").filter({ hasText: "Participant anonymisé" })).toHaveCount(1);
});

test("email templates: edit with live preview", async ({ page }) => {
  await page.goto("/admin/parametres/emails");
  await expect(page.getByText(/boîte d'envoi locale/)).toBeVisible();
  await page.getByRole("link", { name: "Placement en liste d'attente" }).click();
  const subject = page.getByRole("textbox", { name: "Objet" });
  await subject.fill("Liste d'attente pour {{formation}} ({{inconnue}})");
  await expect(
    page.getByText("Objet : Liste d'attente pour Manager une équipe au quotidien ({{inconnue}})"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Variables inconnues/)).toBeVisible();
  await page.getByRole("button", { name: "Rétablir le modèle par défaut" }).click();
  await expect(subject).toHaveValue("Liste d'attente : {{formation}}");
});

test("dashboard, audit log and evaluation settings", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Sessions des 30 prochains jours/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sous la capacité minimale à J-10/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Émargements non signés/ })).toBeVisible();

  await page.goto("/admin/parametres/journal?entite=session");
  await expect(page.getByRole("heading", { name: "Journal d'audit" })).toBeVisible();

  const stamp = Date.now();
  await page.goto("/admin/parametres/evaluations");
  const newQuestion = page.locator("div.border-dashed").first();
  await newQuestion.getByRole("textbox", { name: "Nouvelle question" }).fill(`Question test ${stamp}`);
  await newQuestion.getByRole("combobox", { name: "Type de réponse" }).selectOption("single_choice");
  await newQuestion.getByRole("textbox", { name: "Choix (un par ligne)" }).fill("Oui");
  await newQuestion.getByRole("button", { name: "Ajouter la question" }).click();
  await expect(page.getByText("Indiquez au moins deux choix, un par ligne.")).toBeVisible();
  await newQuestion.getByRole("textbox", { name: "Choix (un par ligne)" }).fill("Oui\nNon");
  await newQuestion.getByRole("button", { name: "Ajouter la question" }).click();
  const added = page.getByRole("listitem").filter({
    has: page.getByRole("textbox", { name: "Libellé" }).and(page.locator(`[value="Question test ${stamp}"]`)),
  });
  await expect(added).toHaveCount(1);
  await added.getByRole("button", { name: "Supprimer" }).click();
  await expect(added).toHaveCount(0);

  // Not clicked here: it would process the sessions of the other tests running in parallel
  // (the scheduled job is covered by tests/integration/automation.test.ts).
  await expect(page.getByRole("button", { name: "Exécuter les tâches automatiques maintenant" })).toBeVisible();
});
