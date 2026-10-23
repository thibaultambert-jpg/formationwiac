"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import type { ActionState } from "@/server/forms";

/** One-click server action with its result message (BO grouped actions). */
export function ActionButton({
  action,
  hidden,
  label,
  variant,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  label: string;
  variant?: "default" | "outline" | "secondary";
}) {
  return (
    <ActionForm action={action} className="space-y-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );
}
