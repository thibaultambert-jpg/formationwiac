"use client";

import { ActionButton } from "@/components/forms/action-button";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField, SelectField, TextField } from "@/components/forms/fields";
import { TRAINER_DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { addTrainerDocument, archiveTrainerDocument } from "./document-actions";

const TYPE_OPTIONS = Object.entries(TRAINER_DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function AddTrainerDocumentForm({ trainerId }: { trainerId: string }) {
  return (
    <ActionForm action={addTrainerDocument} className="max-w-3xl">
      <input type="hidden" name="trainerId" value={trainerId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="type" label="Type" defaultValue="diploma" options={TYPE_OPTIONS} />
        <TextField name="label" label="Intitulé" required />
        <TextField name="issuedAt" label="Date d'obtention ou de signature" type="date" />
        <TextField name="expiresAt" label="Date d'échéance" type="date" />
      </div>
      <FileField
        name="file"
        label="Fichier"
        accept="application/pdf,.doc,.docx"
        required
        hint="PDF ou Word, 4 Mo maximum."
      />
      <SubmitButton variant="outline">Ajouter le justificatif</SubmitButton>
    </ActionForm>
  );
}

export function ArchiveTrainerDocumentButton({ documentId }: { documentId: string }) {
  return <ActionButton action={archiveTrainerDocument} hidden={{ documentId }} label="Archiver" variant="outline" />;
}
