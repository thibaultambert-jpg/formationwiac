import { expect, test, type Page } from "@playwright/test";
import { createTraining, emailsFor } from "./support/db";

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function addExternal(page: Page, contact: { firstName: string; lastName: string; email: string }) {
  const dialog = page.getByRole("dialog", { name: "Ajouter un participant externe" });
  await dialog.getByRole("textbox", { name: "Prénom", exact: true }).fill(contact.firstName);
  await dialog.getByRole("textbox", { name: "Nom", exact: true }).fill(contact.lastName);
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(contact.email);
  await dialog.getByRole("button", { name: "Inscrire" }).click();
  await expect(dialog.getByText(`${contact.firstName} ${contact.lastName} est inscrit(e), en attente`)).toBeVisible();
}

// Lot 2 acceptance criterion: an admin creates a 2-day session and enrolls 3
// externals of a new company without leaving the session page.
test("create a 2-day session and enroll 3 externals of a new company", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Formation E2E ${stamp}`);
  const companyName = `Entreprise E2E ${stamp}`;
  const day1 = isoDate(30);

  await page.goto(`/admin/sessions/nouvelle?formation=${trainingId}`);
  await page.getByRole("textbox", { name: "Lieu", exact: true }).fill("Salle Lumière, Paris");

  // Day 1: morning (default row) + afternoon; day 2: two half-days.
  await page.locator('input[name="slotDate"]').first().fill(day1);
  await page.getByRole("button", { name: "Ajouter un créneau" }).click();
  await page.getByRole("button", { name: "Ajouter une journée (2 demi-journées)" }).click();
  await expect(page.locator('input[name="slotDate"]')).toHaveCount(4);

  await page.getByRole("spinbutton", { name: "Capacité maximale" }).fill("10");
  await page.getByRole("checkbox", { name: "Ouverte aux externes" }).check();
  await page.getByRole("button", { name: "Créer la session" }).click();

  await expect(page).toHaveURL(/\/admin\/sessions\/[0-9a-f-]+\?cree=1$/);
  await expect(page.getByText(/Session FORM-\d{4}-\d{3} créée en brouillon/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Créneaux \(4 · 14 h\)/ })).toBeVisible();
  await page.getByRole("button", { name: "Publier" }).click();
  await expect(page.getByText("Publiée", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Inscrits/ }).click();
  await expect(page).toHaveURL(/\/admin\/sessions\/[0-9a-f-]+\/inscrits$/);
  const sessionUrl = page.url();
  await page.getByRole("button", { name: "Ajouter un externe" }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter un participant externe" });
  await dialog.getByRole("radio", { name: "Nouvelle" }).click();
  await dialog.getByRole("textbox", { name: "Raison sociale", exact: true }).fill(companyName);

  await addExternal(page, { firstName: "Inès", lastName: "Durand", email: `ines.${stamp}@e2e.example` });
  // The dialog stays open on the newly created company.
  await expect(dialog.getByText(companyName)).toBeVisible();
  await addExternal(page, { firstName: "Paul", lastName: "Leroy", email: `paul.${stamp}@e2e.example` });
  await addExternal(page, { firstName: "Zoé", lastName: "Petit", email: `zoe.${stamp}@e2e.example` });
  await dialog.getByRole("button", { name: "Terminer" }).click();

  expect(page.url()).toBe(sessionUrl);
  const rows = page.getByRole("row").filter({ hasText: companyName });
  await expect(rows).toHaveCount(3);
  // External enrollments hold their seat until the training agreement is signed (B2).
  await expect(rows.filter({ hasText: "En attente de convention" })).toHaveCount(3);
  await expect(page.getByText("3 / 10 places occupées")).toBeVisible();

  // One agreement for the company, generated as a PDF, then recorded as signed.
  await page.getByRole("link", { name: "Conventions" }).click();
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: companyName }) });
  await card.getByRole("button", { name: "Générer la convention" }).click();
  const create = page.getByRole("dialog", { name: `Convention avec ${companyName}` });
  await create.getByRole("textbox", { name: "Conditions financières" }).fill("Paiement à 30 jours.");
  await create.getByRole("button", { name: "Générer le PDF" }).click();
  await expect(card.getByText(/CONV-\d{4}-\d{3}/)).toHaveCount(4);
  await expect(card.getByText("Brouillon", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Convention signée" }).click();
  const signed = page.getByRole("dialog", { name: /Enregistrer la convention signée/ });
  await signed.getByLabel("Convention signée (PDF)").setInputFiles("e2e/fixtures/programme.pdf");
  await signed.getByLabel("Date de signature").fill(isoDate(0));
  await signed.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByText("Signée", { exact: true })).toBeVisible();
  await expect(card.getByText("Confirmée")).toHaveCount(3);

  await page.getByRole("link", { name: /Inscrits/ }).click();
  await expect(page.getByRole("row").filter({ hasText: companyName }).filter({ hasText: "Confirmée" })).toHaveCount(3);
  // The trainees are notified once their enrollment is confirmed.
  await expect
    .poll(async () => (await emailsFor(`ines.${stamp}@e2e.example`)).map((email) => email.type))
    .toEqual(["enrollment_confirmation"]);
});

test("the waitlist is used at capacity and promoted on cancellation", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Formation capacité ${stamp}`);

  await page.goto(`/admin/sessions/nouvelle?formation=${trainingId}`);
  await page.getByRole("textbox", { name: "Lien visio", exact: true }).fill("https://meet.example/e2e");
  await page.locator('input[name="slotDate"]').first().fill(isoDate(45));
  await page.getByRole("spinbutton", { name: "Capacité maximale" }).fill("2");
  await page.getByRole("checkbox", { name: "Ouverte aux externes" }).check();
  await page.getByRole("button", { name: "Créer la session" }).click();
  await expect(page).toHaveURL(/\?cree=1$/);
  await page.getByRole("button", { name: "Publier" }).click();
  await page.getByRole("link", { name: /Inscrits/ }).click();

  await page.getByRole("button", { name: "Ajouter un externe" }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter un participant externe" });
  await dialog.getByRole("radio", { name: "Nouvelle" }).click();
  await dialog.getByRole("textbox", { name: "Raison sociale", exact: true }).fill(`Capacité ${stamp}`);
  await addExternal(page, { firstName: "Un", lastName: "Premier", email: `un.${stamp}@e2e.example` });
  await addExternal(page, { firstName: "Deux", lastName: "Second", email: `deux.${stamp}@e2e.example` });

  await dialog.getByRole("textbox", { name: "Prénom", exact: true }).fill("Trois");
  await dialog.getByRole("textbox", { name: "Nom", exact: true }).fill("Troisième");
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(`trois.${stamp}@e2e.example`);
  await dialog.getByRole("button", { name: "Inscrire" }).click();
  await expect(dialog.getByText("Trois Troisième a été placé(e) en liste d'attente")).toBeVisible();
  await dialog.getByRole("button", { name: "Terminer" }).click();

  await expect(page.getByText("Complète", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Trois Troisième" })).toContainText("Liste d'attente n° 1");

  // Cancel the first enrollment: the waitlisted one is promoted.
  await page.getByRole("row").filter({ hasText: "Un Premier" }).getByRole("button", { name: "Modifier" }).click();
  const edit = page.getByRole("dialog", { name: /Inscription de Un Premier/ });
  await edit.getByRole("combobox", { name: "Statut" }).selectOption("cancelled");
  await edit.getByRole("textbox", { name: "Motif d'annulation" }).fill("Empêchement");
  await edit.getByRole("button", { name: "Enregistrer" }).click();

  // An external promoted from the waitlist still needs its training agreement.
  await expect(page.getByRole("row").filter({ hasText: "Trois Troisième" })).toContainText("En attente de convention");
  await expect(page.getByRole("row").filter({ hasText: "Un Premier" })).toContainText("Annulée");
  await expect(page.getByText("Complète", { exact: true })).toBeVisible();

  // Emails: the waitlist notice; the confirmation waits for the agreement.
  await expect
    .poll(async () => (await emailsFor(`trois.${stamp}@e2e.example`)).map((email) => email.type))
    .toEqual(["waitlist_notice"]);

  // Cancelling the session notifies the active enrollments.
  await page.getByRole("link", { name: "Informations" }).click();
  await page.getByRole("button", { name: "Annuler la session" }).click();
  await page.getByRole("textbox", { name: "Motif de l'annulation" }).fill("Formateur indisponible");
  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(page.getByText(/Session annulée le/)).toBeVisible();
  await expect
    .poll(async () => (await emailsFor(`deux.${stamp}@e2e.example`)).map((email) => email.type))
    .toEqual(["session_cancellation"]);
  await page.getByRole("link", { name: "Documents" }).click();
  await page
    .getByRole("link", { name: /^Annulation :/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Contenu de l'email" })).toContainText("est annulée");
});
