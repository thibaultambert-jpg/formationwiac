import { z } from "zod";

// French messages for every zod validation without a custom message.
z.config(z.locales.fr());

// Shared helpers for server actions used with useActionState.

export type FieldErrors = Record<string, string>;
export type FormValues = Record<string, string>;

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: Record<string, string> }
  | { status: "error"; message?: string; fieldErrors?: FieldErrors; values?: FormValues }
  // Non-blocking warnings: the form is submitted again with confirm=1.
  | { status: "warning"; warnings: string[]; values?: FormValues };

export const IDLE: ActionState = { status: "idle" };

export function formValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

/** Trimmed string, or null when empty. */
export function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true" || formData.get(key) === "1";
}

export function isConfirmed(formData: FormData): boolean {
  return formData.get("confirm") === "1";
}

/** Converts zod issues into a field → first message map. */
export function zodFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function errorState(formData: FormData, message: string, fieldErrors?: FieldErrors): ActionState {
  return { status: "error", message, fieldErrors, values: formValues(formData) };
}
