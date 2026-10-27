import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { domain } from "./support/auth";
import { createTraining, upsertUser } from "./support/db";
import { createSessionViaUi, isoDate } from "./support/session";

async function importCsv(page: Page, testInfo: TestInfo, lines: string[]) {
  const file = testInfo.outputPath(`import-${Date.now()}.csv`);
  await writeFile(file, lines.join("\n"));
  await page.getByRole("button", { name: "Importer un CSV" }).click();
  await page.getByLabel("Fichier CSV").setInputFiles(file);
  await page.getByRole("button", { name: "Importer", exact: true }).click();
}

test("every import offers its example file", async ({ page }) => {
  for (const [path, type] of [
    ["/admin/sessions", "sessions"],
    ["/admin/formateurs", "formateurs"],
    ["/admin/entreprises", "entreprises"],
  ]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Importer un CSV" }).click();
    const link = page.getByRole("link", { name: "Télécharger le fichier exemple" });
    await expect(link).toHaveAttribute("href", `/admin/modeles-import/${type}`);
    await page.keyboard.press("Escape");
  }
  for (const type of ["sessions", "formateurs", "entreprises", "inscrits"]) {
    const response = await page.request.get(`/admin/modeles-import/${type}`);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain(`modele-import-${type}.csv`);
    expect((await response.text()).charCodeAt(0)).toBe(0xfeff);
  }
  expect((await page.request.get("/admin/modeles-import/inconnu")).status()).toBe(404);
});

test("CSV import of trainers and companies", async ({ page }, testInfo) => {
  const stamp = Date.now();
  await page.goto("/admin/formateurs");
  await importCsv(page, testInfo, [
    "Prénom;Nom;E-mail;Société;Spécialités",
    `Claire;Import${stamp};claire.${stamp}@import.example;Durand Conseil;Management, RH`,
    `;Sans prénom;pas-un-email;;`,
  ]);
  await expect(page.getByText(/Import terminé : 1 formateur\(s\) créé\(s\)\. Lignes ignorées : ligne 3/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: `Import${stamp}` })).toBeVisible();

  // The same file again: the trainer already exists and is left as it is.
  await importCsv(page, testInfo, ["prenom;nom;email", `Claire;Import${stamp};claire.${stamp}@import.example`]);
  await expect(
    page.getByText("Import terminé : 0 formateur(s) créé(s), 1 déjà existant(s), non modifié(s)."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/admin/entreprises");
  await importCsv(page, testInfo, [
    "raison_sociale;siret;ville",
    `Import Corp ${stamp};;Lyon`,
    `Import Bis ${stamp};123;Paris`,
  ]);
  await expect(
    page.getByText(/Import terminé : 1 entreprise\(s\) créée\(s\)\. Lignes ignorées : ligne 3 \(SIRET invalide\)/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: `Import Corp ${stamp}` })).toBeVisible();
});

test("CSV import of sessions, created as drafts", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const title = `Import sessions ${stamp}`;
  const trainingId = await createTraining(title);
  const day = isoDate(90).split("-").reverse().join("/");

  await page.goto("/admin/sessions");
  await importCsv(page, testInfo, [
    "formation;creneaux;capacite_max;lieu;externes",
    `${title};${day} 09:00-12:30 | ${day} 13:30-17:00;12;Salle ${stamp};oui`,
    `Formation inconnue ${stamp};${day} 09:00-12:00;10;Paris;`,
    `${title};${day} 09:00-12:00;10;;`,
  ]);
  await expect(page.getByText(/Import terminé : 1 session\(s\) créée\(s\) en brouillon \(FORM-/)).toBeVisible();
  await expect(page.getByText(/ligne 3 \(formation « Formation inconnue \d+ » introuvable\)/)).toBeVisible();
  await expect(page.getByText(/ligne 4 \(Indiquez un lieu ou un lien visio\.\)/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/admin/sessions?formation=${trainingId}`);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Brouillon");
});

test("CSV import of enrollees: collaborators and external contacts", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const collaborator = `import.${stamp}@${domain()}`;
  await upsertUser(collaborator, "employee", "Inès", `Collab${stamp}`);
  const trainingId = await createTraining(`Import inscrits ${stamp}`);
  const sessionId = await createSessionViaUi(page, { trainingId, date: isoDate(95), external: false });

  await page.goto(`/admin/sessions/${sessionId}/inscrits`);
  await importCsv(page, testInfo, [
    "type;entreprise;prenom;nom;email",
    `interne;;Inès;Collab${stamp};${collaborator}`,
    `interne;;Inconnu;Absent;absent.${stamp}@${domain()}`,
    `externe;ACME ${stamp};Ext;Erne;ext.${stamp}@acme.example`,
  ]);
  await expect(
    page.getByText(/Import terminé : 1 inscrit\(s\)\. Lignes ignorées : ligne 3 \(aucun compte collaborateur/),
  ).toBeVisible();
  await expect(page.getByText(/ligne 4 \(session non ouverte aux participants externes\)/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: `Collab${stamp}` })).toHaveCount(1);
});
