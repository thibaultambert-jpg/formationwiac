import { expect, test, type Page } from "@playwright/test";
import { domain, signedInContext } from "./support/auth";
import {
  createCompletedSessionFor,
  createPublishedSession,
  createTraining,
  emailsFor,
  linkInternalTrainer,
} from "./support/db";

async function enrollInThreeClicks(page: Page, trainingTitle: string, confirmLabel: RegExp) {
  await page.goto(`/?q=${encodeURIComponent(trainingTitle)}`);
  await page.getByRole("link", { name: new RegExp(trainingTitle) }).click(); // 1
  await page.getByRole("button", { name: /S'inscrire|Rejoindre la liste d'attente/ }).click(); // 2
  await page.getByRole("button", { name: confirmLabel }).click(); // 3
}

// Lot 3 acceptance criterion: a collaborator enrolls in 3 clicks; at capacity
// the next one is waitlisted and promoted at the first cancellation.
test("3-click enrollment, waitlist and promotion on unenrollment", async ({ browser }) => {
  const stamp = Date.now();
  const title = `Front ${stamp}`;
  const trainingId = await createTraining(title);
  await createPublishedSession(trainingId, { capacity: 2, daysFromNow: 20, reference: `E2E-${stamp}` });
  const people = ["un", "deux", "trois"].map((name, index) => ({
    email: `front-${name}-${stamp}@${domain()}`,
    role: "employee" as const,
    firstName: `Collab${index + 1}`,
    lastName: `Front${stamp}`,
  }));
  const contexts = await Promise.all(people.map((person) => signedInContext(browser, person)));
  const [first, second, third] = await Promise.all(contexts.map((context) => context.newPage()));

  await enrollInThreeClicks(first, title, /^Confirmer l'inscription$/);
  await expect(first.getByText("Votre inscription est confirmée.", { exact: false })).toBeVisible();
  await first.getByRole("button", { name: "Terminé" }).click();
  await expect(first.getByText("Vous êtes inscrit(e)")).toBeVisible();
  await expect(first.getByRole("button", { name: "S'inscrire" })).toHaveCount(0);

  await enrollInThreeClicks(second, title, /^Confirmer l'inscription$/);
  await expect(second.getByText("Votre inscription est confirmée.", { exact: false })).toBeVisible();

  await enrollInThreeClicks(third, title, /Confirmer \(liste d'attente\)/);
  await expect(third.getByText(/vous êtes inscrit\(e\) en liste d'attente/)).toBeVisible();
  await third.getByRole("button", { name: "Terminé" }).click();
  await expect(third.getByText("Liste d'attente, position 1")).toBeVisible();

  // The first collaborator unenrolls from "Mes formations": the third one is promoted.
  await first.goto("/mes-formations");
  const card = first.getByRole("listitem").filter({ hasText: title });
  await card.getByRole("button", { name: "Se désinscrire" }).click();
  await first.getByRole("button", { name: "Confirmer la désinscription" }).click();
  await expect(first.getByRole("dialog")).toBeHidden();
  await expect(first.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);

  await third.goto("/mes-formations");
  await expect(third.getByRole("listitem").filter({ hasText: title })).toContainText("Inscription confirmée");

  // Emails: confirmation for the first two, waitlist then promotion for the third.
  await expect
    .poll(async () => (await emailsFor(people[0].email)).map((email) => email.type))
    .toEqual(["enrollment_confirmation"]);
  await expect
    .poll(async () => (await emailsFor(people[2].email)).map((email) => email.type))
    .toEqual(["waitlist_notice", "waitlist_promotion"]);
  const ics = await third.request.get(
    await third
      .getByRole("link", { name: "Ajouter à l'agenda" })
      .first()
      .getAttribute("href")
      .then((href) => href!),
  );
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain(`SUMMARY:${title}`);

  await Promise.all(contexts.map((context) => context.close()));
});

test("front rules: closed sessions are hidden, overlapping enrollment is blocked", async ({ browser }) => {
  const stamp = Date.now();
  const title = `Chevauchement ${stamp}`;
  const otherTitle = `Même horaire ${stamp}`;
  const first = await createTraining(title);
  const second = await createTraining(otherTitle);
  await createPublishedSession(first, { capacity: 5, daysFromNow: 25, reference: `E2E-A-${stamp}` });
  await createPublishedSession(second, { capacity: 5, daysFromNow: 25, reference: `E2E-B-${stamp}` });
  const context = await signedInContext(browser, {
    email: `front-chev-${stamp}@${domain()}`,
    role: "employee",
    firstName: "Chev",
    lastName: `Front${stamp}`,
  });
  const page = await context.newPage();

  await enrollInThreeClicks(page, title, /^Confirmer l'inscription$/);
  await expect(page.getByText("Votre inscription est confirmée.", { exact: false })).toBeVisible();
  await enrollInThreeClicks(page, otherTitle, /^Confirmer l'inscription$/);
  await expect(page.getByText(/Vous êtes déjà inscrit\(e\) à une session aux mêmes horaires/)).toBeVisible();

  // A draft session is not shown on the front.
  const hiddenTitle = `Brouillon ${stamp}`;
  await createTraining(hiddenTitle);
  await page.goto(`/?q=${encodeURIComponent(hiddenTitle)}`);
  await expect(page.getByText("Aucune formation ne correspond")).toBeVisible();
  await context.close();
});

test("past trainings: certificate download and evaluation from « Mes formations »", async ({ browser }) => {
  const stamp = Date.now();
  const title = `Passée ${stamp}`;
  const person = {
    email: `front-passe-${stamp}@${domain()}`,
    role: "employee" as const,
    firstName: "Paula",
    lastName: `Passe${stamp}`,
  };
  const context = await signedInContext(browser, person);
  const trainingId = await createTraining(title);
  await createCompletedSessionFor(trainingId, person.email, `E2E-C-${stamp}`);
  const page = await context.newPage();

  await page.goto("/mes-formations");
  const row = page.getByRole("listitem").filter({ hasText: title });
  const certificate = await page.request.get(
    (await row.getByRole("link", { name: "Attestation" }).getAttribute("href"))!,
  );
  expect(certificate.headers()["content-type"]).toBe("application/pdf");

  await row.getByRole("link", { name: "Donner mon avis" }).click();
  await expect(page).toHaveURL(/\/evaluation\//);
  await expect(page.getByRole("heading", { name: "Votre avis sur la formation" })).toBeVisible();
  await page.getByRole("button", { name: "Envoyer mes réponses" }).click();
  // Required answers are checked by the browser first, then by the server.
  await expect(page.getByText("Merci pour vos réponses !")).toHaveCount(0);
  await context.close();
});

test("internal trainer: « Mes sessions » with live attendance", async ({ browser }) => {
  const stamp = Date.now();
  const person = {
    email: `front-formateur-${stamp}@${domain()}`,
    role: "trainer" as const,
    firstName: "Fanny",
    lastName: `Anime${stamp}`,
  };
  const context = await signedInContext(browser, person);
  const trainingId = await createTraining(`Animée ${stamp}`);
  const sessionId = await createPublishedSession(trainingId, {
    capacity: 5,
    daysFromNow: 3,
    reference: `E2E-T-${stamp}`,
  });
  await linkInternalTrainer(sessionId, person.email);
  const page = await context.newPage();

  await page.goto("/mes-sessions");
  await page.getByRole("link", { name: new RegExp(`Animée ${stamp}`) }).click();
  await expect(page.getByRole("heading", { name: `Animée ${stamp}` })).toBeVisible();
  await expect(page.getByText("Émargement fermé")).toBeVisible();
  await context.close();
});
