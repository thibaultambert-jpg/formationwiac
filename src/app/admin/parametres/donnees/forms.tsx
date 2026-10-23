"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { anonymizeExpired, purgeExpiredProofs, saveRetention } from "./actions";

export function RetentionForm({ years }: { years: number }) {
  return (
    <ActionForm action={saveRetention} className="flex max-w-md flex-col gap-3 space-y-0 sm:flex-row sm:items-end">
      <TextField
        name="dataRetentionYears"
        label="Durée de conservation (années)"
        type="number"
        min={1}
        max={30}
        defaultValue={years}
        className="flex-1"
      />
      <SubmitButton>Enregistrer</SubmitButton>
    </ActionForm>
  );
}

export function AnonymizeExpiredForm({ count }: { count: number }) {
  return (
    <ActionForm action={anonymizeExpired}>
      <SubmitButton variant="destructive">{`Anonymiser ${count} participant(s)`}</SubmitButton>
    </ActionForm>
  );
}

export function PurgeProofsForm({ count }: { count: number }) {
  return (
    <ActionForm action={purgeExpiredProofs}>
      <SubmitButton variant="destructive">{`Supprimer ${count} fichier(s)`}</SubmitButton>
    </ActionForm>
  );
}
