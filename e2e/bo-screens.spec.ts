import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createTraining, upsertUser } from "./support/db";
import { createSessionViaUi, isoDate } from "./support/session";

test("themes, trainings with program PDF, archiving", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/admin/parametres/themes");
  await page.getByRole("textbox", { name: "Nouveau thème" }).fill(`Thème ${stamp}`);
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(`Thème « Thème ${stamp} » ajouté.`)).toBeVisible();

  await page.goto("/admin/formations/nouvelle");
  await page.getByRole("textbox", { name: "Titre", exact: true }).fill(`Excel avancé ${stamp}`);
  await page.getByRole("combobox", { name: "Thème" }).selectOption({ label: `Thème ${stamp}` });
  await page.getByRole("textbox", { name: "Durée (heures)" }).fill("10,5");
  await page.getByRole("textbox", { name: "Prix HT par participant (€)" }).fill("1 200,50");
  await page.getByRole("textbox", { name: "Objectifs pédagogiques" }).fill("Maîtriser les tableaux croisés.");
  await page.getByLabel("Programme PDF").setInputFiles("e2e/fixtures/programme.pdf");
  await page.getByRole("button", { name: "Créer la formation" }).click();

  await expect(page.getByText("La formation a été créée.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Identifiant d'URL" })).toHaveValue(`excel-avance-${stamp}`);
  await expect(page.getByRole("textbox", { name: "Durée (heures)" })).toHaveValue("10,5");
  const program = page.getByRole("link", { name: "Voir le programme actuel" });
  const href = await program.getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.getByRole("button", { name: "Archiver" }).click();
  await expect(page.getByText(/Cette formation est archivée/)).toBeVisible();
  await page.goto(`/admin/formations?q=${stamp}&statut=archivees`);
  await expect(page.getByRole("row").filter({ hasText: `Excel avancé ${stamp}` })).toContainText("Archivée");
});

test("validation errors keep the typed values", async ({ page }) => {
  await page.goto("/admin/formations/nouvelle");
  await page.getByRole("textbox", { name: "Titre", exact: true }).fill("Durée invalide");
  await page.getByRole("textbox", { name: "Objectifs pédagogiques" }).fill("Objectifs");
  await page.getByRole("textbox", { name: "Durée (heures)" }).fill("abc");
  await page.getByRole("button", { name: "Créer la formation" }).click();
  await expect(page.getByText("Certains champs sont invalides.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Titre", exact: true })).toHaveValue("Durée invalide");
  await expect(page.getByText("Nombre invalide.")).toBeVisible();
});

test("internal trainers get the trainer role, and conflicts are reported", async ({ page }) => {
  const stamp = Date.now();
  const email = `formateur.${stamp}@${process.env.ALLOWED_GOOGLE_DOMAIN ?? "example.fr"}`;
  await upsertUser(email, "employee", "Fabien", `Formateur${stamp}`);

  await page.goto("/admin/formateurs/nouveau");
  await page.getByRole("radio", { name: "Interne" }).check();
  await page.getByRole("searchbox").fill(`Formateur${stamp}`);
  await page.getByRole("button", { name: new RegExp(`Fabien Formateur${stamp}`) }).click();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(email);
  await page.getByRole("textbox", { name: "Spécialités" }).fill("Bureautique, Excel");
  await page.getByRole("button", { name: "Créer le formateur" }).click();
  await expect(page.getByText("La fiche formateur a été créée.")).toBeVisible();

  await page.goto(`/admin/parametres/utilisateurs?q=${encodeURIComponent(email)}`);
  await expect(
    page.getByRole("listitem").filter({ hasText: email }).getByRole("combobox", { name: "Rôle" }),
  ).toHaveValue("trainer");

  // Two sessions on the same slot with the same trainer: warning, then confirmation.
  const trainingId = await createTraining(`Conflit ${stamp}`);
  const date = isoDate(60);
  await createSessionViaUi(page, { trainingId, date, trainer: `Formateur${stamp}` });
  await page.goto(`/admin/sessions/nouvelle?formation=${trainingId}`);
  await page.getByRole("textbox", { name: "Lieu", exact: true }).fill("Autre salle");
  await page.locator('input[name="slotDate"]').first().fill(date);
  await page.getByRole("checkbox", { name: new RegExp(`Formateur${stamp}`) }).check();
  await page.getByRole("button", { name: "Créer la session" }).click();
  await expect(page.getByText(new RegExp(`Fabien Formateur${stamp} est déjà affecté\\(e\\)`))).toBeVisible();
  await page.getByRole("button", { name: "Confirmer malgré tout" }).click();
  await expect(page).toHaveURL(/\?cree=1$/);
});

test("companies: contacts, duplicates merge and export", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/admin/entreprises/nouvelle");
  await page.getByRole("textbox", { name: "Raison sociale" }).fill(`Durand SA ${stamp}`);
  await page.getByRole("textbox", { name: "SIRET" }).fill("123");
  await page.getByRole("button", { name: "Créer l'entreprise" }).click();
  await expect(page.getByText("SIRET invalide (14 chiffres).")).toBeVisible();
  await page.getByRole("textbox", { name: "SIRET" }).fill("");
  await page.getByRole("button", { name: "Créer l'entreprise" }).click();
  await expect(page.getByText(/L'entreprise a été créée/)).toBeVisible();
  const targetUrl = page.url().replace("?cree=1", "");

  await page.getByRole("button", { name: "Ajouter un contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau contact" });
  await dialog.getByRole("textbox", { name: "Prénom" }).fill("Marie");
  await dialog.getByRole("textbox", { name: "Nom", exact: true }).fill("Durand");
  await dialog.getByRole("textbox", { name: "Email" }).fill(`marie.${stamp}@durand.example`);
  await dialog.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText("Contact principal")).toBeVisible();

  // Same name: warning, then a duplicate with one contact.
  await page.goto("/admin/entreprises/nouvelle");
  await page.getByRole("textbox", { name: "Raison sociale" }).fill(`Durand SA ${stamp}`);
  await page.getByRole("button", { name: "Créer l'entreprise" }).click();
  await expect(page.getByText(/existe déjà/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmer malgré tout" }).click();
  await expect(page.getByText(/L'entreprise a été créée/)).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un contact" }).click();
  const second = page.getByRole("dialog", { name: "Nouveau contact" });
  await second.getByRole("textbox", { name: "Prénom" }).fill("Luc");
  await second.getByRole("textbox", { name: "Nom", exact: true }).fill("Durand");
  await second.getByRole("textbox", { name: "Email" }).fill(`luc.${stamp}@durand.example`);
  await second.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(`luc.${stamp}@durand.example`)).toBeVisible();
  const duplicateId = page.url().split("/").pop()!.replace("?cree=1", "");

  await page.goto(targetUrl);
  await page.getByRole("searchbox").fill(`Durand SA ${stamp}`);
  const options = page.getByRole("listitem").getByRole("button", { name: new RegExp(`Durand SA ${stamp}`) });
  await expect(options).toHaveCount(2);
  await page.locator("form").filter({ hasText: "Fusionner" }).getByRole("button").nth(1).click();
  await page.getByRole("button", { name: "Fusionner" }).click();
  // Merging a company into itself is refused; the other one is accepted.
  const message = page.getByText(/a été fusionnée|ne peut pas être fusionnée/);
  await expect(message).toBeVisible();
  if ((await message.textContent())?.includes("ne peut pas")) {
    await page.getByRole("button", { name: "Changer" }).click();
    await page.getByRole("searchbox").fill(`Durand SA ${stamp}`);
    await page.locator("form").filter({ hasText: "Fusionner" }).getByRole("button").first().click();
    await page.getByRole("button", { name: "Fusionner" }).click();
  }
  await expect(page.getByText(/a été fusionnée : 1 contact\(s\)/)).toBeVisible();
  await expect(page.getByText(`luc.${stamp}@durand.example`)).toBeVisible();

  // The merged company redirects to the target.
  await page.goto(`/admin/entreprises/${duplicateId}`);
  await expect(page).toHaveURL(targetUrl);

  const csv = await page.request.get("/admin/entreprises/export");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(`luc.${stamp}@durand.example`);
});

test("CSV import, move between sessions and enrollment export", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Import ${stamp}`);
  const first = await createSessionViaUi(page, { trainingId, date: isoDate(70) });
  const second = await createSessionViaUi(page, { trainingId, date: isoDate(77) });

  const file = testInfo.outputPath("import.csv");
  await writeFile(
    file,
    [
      "Entreprise;SIRET;Prénom;Nom;E-mail;Fonction",
      `Import Corp ${stamp};;Anna;Import;anna.${stamp}@import.example;RH`,
      `Import Corp ${stamp};;Bob;Import;bob.${stamp}@import.example;`,
      `Import Corp ${stamp};;;Sans prénom;pas-un-email;`,
    ].join("\n"),
  );

  await page.goto(`/admin/sessions/${first}/inscrits`);
  await page.getByRole("button", { name: "Importer un CSV" }).click();
  await page.getByLabel("Fichier CSV").setInputFiles(file);
  await page.getByRole("button", { name: "Importer", exact: true }).click();
  await expect(
    page.getByText(
      /Import terminé : 2 inscrit\(s\), 1 entreprise\(s\) créée\(s\), 2 contact\(s\) créé\(s\)\. Lignes ignorées : ligne 4/,
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: `Import Corp ${stamp}` })).toHaveCount(2);

  await page.getByRole("row").filter({ hasText: "Anna Import" }).getByRole("button", { name: "Déplacer" }).click();
  const move = page.getByRole("dialog", { name: "Déplacer Anna Import" });
  const target = move.getByRole("combobox", { name: "Session de destination" });
  const optionValue = await target
    .locator("option")
    .filter({ hasText: `Import ${stamp}` })
    .first()
    .getAttribute("value");
  expect(optionValue).toBe(second);
  await target.selectOption(second);
  await move.getByRole("button", { name: "Déplacer" }).click();
  // The dialog hides the page from the accessibility tree until it closes on success.
  await expect(move).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Anna Import" })).toHaveCount(0);

  await page.goto(`/admin/sessions/${second}/inscrits`);
  await expect(page.getByRole("row").filter({ hasText: "Anna Import" })).toContainText("Confirmée");

  const csv = await page.request.get(`/admin/sessions/${second}/inscrits/export`);
  const content = await csv.text();
  expect(content.charCodeAt(0)).toBe(0xfeff);
  expect(content).toContain(`anna.${stamp}@import.example`);

  await page.goto(`/admin/sessions/${second}/historique`);
  await expect(page.getByText("Déplacement · Inscription Anna Import")).toBeVisible();
});

test("organization settings", async ({ page }) => {
  await page.goto("/admin/parametres/organisme");
  await page.getByRole("textbox", { name: "SIRET" }).fill("12345678901234");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("SIRET invalide (14 chiffres).")).toBeVisible();
  await page.getByRole("textbox", { name: "SIRET" }).fill("732 829 320 00074");
  await page.getByRole("textbox", { name: "Numéro de déclaration d'activité" }).fill("11 75 12345 75");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Les coordonnées de l'organisme ont été enregistrées.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "SIRET" })).toHaveValue("73282932000074");
});

test("edit a session: errors keep the slots, then duplicate it", async ({ page }) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Edition ${stamp}`);
  const date = isoDate(90);
  const id = await createSessionViaUi(page, { trainingId, date });

  await page.goto(`/admin/sessions/${id}/modifier`);
  await page.getByRole("button", { name: "Ajouter un créneau" }).click();
  await page.getByRole("spinbutton", { name: "Capacité minimale" }).fill("50");
  await page.getByRole("button", { name: "Enregistrer la session" }).click();
  await expect(page.getByText("La capacité minimale dépasse la capacité maximale.")).toBeVisible();
  await expect(page.locator('input[name="slotDate"]')).toHaveCount(2);
  await expect(page.locator('input[name="slotDate"]').nth(1)).toHaveValue(date);
  await expect(page.locator('input[name="slotStart"]').nth(1)).toHaveValue("13:30");

  await page.getByRole("spinbutton", { name: "Capacité minimale" }).fill("4");
  await page.getByRole("button", { name: "Enregistrer la session" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sessions/${id}\\?modifie=1$`));
  await expect(page.getByRole("heading", { name: /Créneaux \(2 · 7 h\)/ })).toBeVisible();

  await page.getByRole("button", { name: "Dupliquer" }).click();
  await expect(page).toHaveURL(/\/modifier\?duplique=1$/);
  await expect(page.getByText(/Session dupliquée en brouillon/)).toBeVisible();
  await expect(page.locator('input[name="slotDate"]')).toHaveCount(2);

  await page.goto(`/admin/sessions/${id}/historique`);
  await expect(page.getByText("capacité min : — → 4")).toBeVisible();
});
