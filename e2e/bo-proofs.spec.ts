import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { addExternalEnrollment, addTrainer, createJustEndedSession, createTraining } from "./support/db";
import { firstLink, lastEmailText } from "./support/outbox";

// Lot 4 acceptance criterion: for a completed session, the BO downloads a ZIP
// with the signed attendance sheet, the evaluations and the certificates.
test("attendance by link and on the trainer's device, closure, evaluation and proofs ZIP", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const trainingId = await createTraining(`Preuves ${stamp}`);
  const sessionId = await createJustEndedSession(trainingId, `E2E-P-${stamp}`);
  const alice = { firstName: "Alice", lastName: `Signe${stamp}`, email: `alice.${stamp}@e2e.example` };
  const bruno = { firstName: "Bruno", lastName: `Tablette${stamp}`, email: `bruno.${stamp}@e2e.example` };
  const chloe = { firstName: "Chloe", lastName: `Absente${stamp}`, email: `chloe.${stamp}@e2e.example` };
  const dina = { firstName: "Dina", lastName: `Case${stamp}`, email: `dina.${stamp}@e2e.example` };
  for (const person of [alice, bruno, chloe, dina]) await addExternalEnrollment(sessionId, person);
  const trainerEmail = `theo.${stamp}@e2e.example`;
  await addTrainer(sessionId, trainerEmail, `Formateur${stamp}`);

  // Convocations (PDF attached) from the Documents tab.
  await page.goto(`/admin/sessions/${sessionId}/documents`);
  await page.getByRole("button", { name: "Envoyer les convocations" }).click();
  await expect(page.getByText("Convocations : 4 envoyé(s).")).toBeVisible();
  await expect(page.getByRole("link", { name: "Convocation" })).toHaveCount(4);

  // Attendance links from the BO: one single-use link per trainee and slot (C2).
  await page.goto(`/admin/sessions/${sessionId}/emargement`);
  await page.getByRole("button", { name: "Envoyer les liens d'émargement" }).click();
  await expect(page.getByText(/Liens d'émargement : 5 envoyé\(s\)/)).toBeVisible();

  const anonymous = await browser.newContext({ locale: "fr-FR" });
  const guest = await anonymous.newPage();

  // Alice signs with her personal link, by drawing on the canvas.
  const aliceLink = firstLink(await lastEmailText(alice.email, "attendance_link"), "/emargement/");
  expect(aliceLink).not.toBeNull();
  await guest.goto(aliceLink!);
  await guest.getByRole("button", { name: "Signer" }).click();
  const pad = guest.getByRole("img", { name: /Zone de signature/ });
  const box = (await pad.boundingBox())!;
  await guest.mouse.move(box.x + 20, box.y + box.height / 2);
  await guest.mouse.down();
  await guest.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 });
  await guest.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 8 });
  await guest.mouse.up();
  await guest.getByRole("button", { name: "Valider la signature" }).click();
  await expect(guest.getByText(/Présence enregistrée le/)).toBeVisible();
  // The link is used: opening it again shows the recorded presence, no new signature.
  await guest.goto(aliceLink!);
  await expect(guest.getByText(/Présence enregistrée/)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Signer" })).toHaveCount(0);

  // Dina certifies her presence with the checkbox, without drawing (H1).
  const dinaLink = firstLink(await lastEmailText(dina.email, "attendance_link"), "/emargement/");
  await guest.goto(dinaLink!);
  await guest.getByRole("button", { name: "Signer" }).click();
  await guest.getByRole("radio", { name: "Certifier ma présence sans dessiner" }).check();
  await guest.getByRole("checkbox", { name: /Je certifie sur l'honneur/ }).check();
  await guest.getByRole("button", { name: "Certifier ma présence" }).click();
  await expect(guest.getByText(/Présence enregistrée le/)).toBeVisible();

  // An unknown link reveals nothing.
  await guest.goto("/emargement/inconnu-inconnu-inconnu-inconnu-inconnu-inconnu");
  await expect(guest.getByText("Ce lien d'émargement n'est pas ou plus valide.", { exact: false })).toBeVisible();

  // The trainer makes Bruno sign on their device, then signs (typed name).
  const trainerLink = firstLink(await lastEmailText(trainerEmail, "trainer_attendance_link"), "/emargement/formateur/");
  expect(await lastEmailText(trainerEmail, "trainer_attendance_link")).toContain(`Bruno Tablette${stamp}`);
  await guest.goto(trainerLink!);
  await guest
    .getByRole("listitem")
    .filter({ hasText: `Bruno Tablette${stamp}` })
    .getByRole("button", { name: "Faire signer" })
    .click();
  await guest.getByRole("textbox", { name: "Ou saisissez votre nom pour signer" }).fill("Bruno Tablette");
  await guest.getByRole("button", { name: "Valider la signature" }).click();
  await expect(
    guest
      .getByRole("listitem")
      .filter({ hasText: `Bruno Tablette${stamp}` })
      .first(),
  ).toContainText("Signé à");
  await guest.getByRole("button", { name: "Signer en tant que formateur" }).click();
  await guest.getByRole("textbox", { name: "Ou saisissez votre nom pour signer" }).fill("Theo Formateur");
  await guest.getByRole("button", { name: "Valider la signature" }).click();
  await expect(guest.getByText("Signée", { exact: true })).toBeVisible();

  // The trainer declares Chloe absent, with a reason (C3); the record is appended.
  await guest
    .getByRole("listitem")
    .filter({ hasText: `Chloe Absente${stamp}` })
    .getByRole("button", { name: "Corriger" })
    .click();
  const correction = guest.getByRole("dialog", { name: /Corriger l'émargement de Chloe/ });
  await correction.getByRole("textbox", { name: "Motif" }).fill("Malade, prévenu par téléphone");
  await correction.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(guest.getByRole("listitem").filter({ hasText: `Chloe Absente${stamp}` })).toContainText("Absent(e)");

  // Closure: two present, one absent; certificates and hot evaluation are sent.
  await page.goto(`/admin/sessions/${sessionId}`);
  await page.getByRole("button", { name: "Clôturer maintenant" }).click();
  await expect(page.getByText("Session clôturée : 3 attestation(s) et 3 évaluation(s) envoyée(s).")).toBeVisible();
  await page.getByRole("link", { name: /Inscrits/ }).click();
  await expect(page.getByRole("row").filter({ hasText: chloe.lastName })).toContainText("Absente");
  await expect(page.getByRole("row").filter({ hasText: alice.lastName })).toContainText("Présente");

  // Alice answers the hot evaluation from her email.
  const evaluationLink = firstLink(await lastEmailText(alice.email, "evaluation_request"), "/evaluation/");
  await guest.goto(evaluationLink!);
  for (const group of await guest.getByRole("group").all()) {
    const first = group.locator("label").first();
    if (await first.count()) await first.click();
  }
  await guest.getByRole("textbox", { name: "Qu'avez-vous le plus apprécié ?" }).fill(`Les exercices ${stamp}`);
  await guest.getByRole("button", { name: "Envoyer mes réponses" }).click();
  await expect(guest.getByText("Merci pour vos réponses !")).toBeVisible();
  await anonymous.close();

  await page.goto(`/admin/sessions/${sessionId}/evaluations`);
  await expect(page.getByText(/1 réponse\(s\) sur 3 participant\(s\) présent\(s\)/)).toBeVisible();
  await expect(page.getByText(`Les exercices ${stamp}`)).toBeVisible();

  // The attendance tab shows the correction history.
  await page.goto(`/admin/sessions/${sessionId}/emargement`);
  await expect(page.getByRole("row").filter({ hasText: chloe.lastName })).toContainText("1 correction");

  // Proofs ZIP.
  await page.goto(`/admin/sessions/${sessionId}/documents`);
  const download = await page.request.get(`/admin/sessions/${sessionId}/documents/zip`);
  expect(download.headers()["content-type"]).toBe("application/zip");
  const files = unzipSync(new Uint8Array(await download.body()));
  const names = Object.keys(files).sort();
  expect(names.filter((name) => name.startsWith("emargement/") && name.endsWith(".pdf"))).toHaveLength(1);
  expect(names.filter((name) => name.startsWith("attestations/"))).toHaveLength(3);
  expect(names).toContain("evaluations/reponses.csv");
  expect(names).toContain("evaluations/synthese.csv");
  // Full dossier (I1): program and index of every document and send.
  expect(names).toContain("index.csv");
  expect(new TextDecoder().decode(files["index.csv"])).toContain("Identifiant Gmail");
  expect(new TextDecoder().decode(files["evaluations/reponses.csv"])).toContain(`Les exercices ${stamp}`);
  const sheet = files[names.find((name) => name.startsWith("emargement/"))!];
  expect(new TextDecoder().decode(sheet.slice(0, 5))).toBe("%PDF-");
  // Signatures are embedded as images in the attendance sheet.
  expect(new TextDecoder("latin1").decode(sheet)).toContain("/Subtype /Image");
  // The final sheet is frozen: the ZIP and the download serve the same file.
  const frozen = await page.request.get(`/admin/sessions/${sessionId}/emargement/feuille`);
  expect(Buffer.from(await frozen.body()).equals(Buffer.from(sheet))).toBe(true);
});
