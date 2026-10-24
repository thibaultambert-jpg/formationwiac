"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField, TextField } from "@/components/forms/fields";
import type { ActionState } from "@/server/forms";

export function LearningAssessmentForm({
  action,
  hidden,
  name,
  options,
  result,
  comment,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  name: string;
  options: { value: string; label: string }[];
  result: string | null;
  comment: string | null;
}) {
  return (
    <ActionForm action={action} className="grid gap-3 space-y-0 sm:grid-cols-[12rem_12rem_1fr_auto] sm:items-end">
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <p className="font-medium sm:pb-2">{name}</p>
      <SelectField
        name="learningResult"
        label={`Résultat de ${name}`}
        defaultValue={result ?? ""}
        options={[{ value: "", label: "—" }, ...options]}
      />
      <TextField name="learningComment" label="Commentaire" defaultValue={comment} />
      <SubmitButton variant="outline">Enregistrer</SubmitButton>
    </ActionForm>
  );
}
