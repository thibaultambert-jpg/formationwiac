import { expect, type Page } from "@playwright/test";

export function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

/** Creates a one-slot session from the BO form and returns its id. */
export async function createSessionViaUi(
  page: Page,
  options: { trainingId: string; date: string; capacity?: number; external?: boolean; trainer?: string },
): Promise<string> {
  await page.goto(`/admin/sessions/nouvelle?formation=${options.trainingId}`);
  await page.getByRole("textbox", { name: "Lieu", exact: true }).fill("Salle E2E");
  await page.locator('input[name="slotDate"]').first().fill(options.date);
  await page.getByRole("spinbutton", { name: "Capacité maximale" }).fill(String(options.capacity ?? 10));
  if (options.external ?? true) await page.getByRole("checkbox", { name: "Ouverte aux externes" }).check();
  if (options.trainer) await page.getByRole("checkbox", { name: new RegExp(options.trainer) }).check();
  await page.getByRole("button", { name: "Créer la session" }).click();
  await expect(page).toHaveURL(/\/admin\/sessions\/[0-9a-f-]+\?cree=1$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}
