"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { createTheme, updateTheme } from "./actions";

export function CreateThemeForm() {
  return (
    <ActionForm action={createTheme} className="flex max-w-xl flex-col gap-3 space-y-0 sm:flex-row sm:items-end">
      <TextField name="name" label="Nouveau thème" required className="flex-1" />
      <SubmitButton>Ajouter</SubmitButton>
    </ActionForm>
  );
}

export function EditThemeForm({ theme }: { theme: { id: string; name: string; position: number } }) {
  return (
    <ActionForm action={updateTheme} hideSuccess className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-end">
      <input type="hidden" name="id" value={theme.id} />
      <TextField name="name" label="Nom" required defaultValue={theme.name} className="flex-1" />
      <TextField name="position" label="Ordre" type="number" defaultValue={theme.position} className="sm:w-24" />
      <SubmitButton variant="outline">Enregistrer</SubmitButton>
    </ActionForm>
  );
}
