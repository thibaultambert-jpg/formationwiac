"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, FileField, TextField } from "@/components/forms/fields";
import { SearchPicker } from "@/components/forms/search-picker";
import { TRAINER_TYPE_LABELS } from "@/lib/labels";
import type { ActionState } from "@/server/forms";
import { searchUsers, type SearchOption } from "@/server/search";

export type TrainerFormValues = {
  id: string;
  type: "internal" | "external";
  user: SearchOption | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  specialties: string[];
  cvPath: string | null;
  active: boolean;
};

export function TrainerForm({
  action,
  trainer,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  trainer?: TrainerFormValues;
}) {
  const [type, setType] = useState(trainer?.type ?? "external");
  // Prefill from the selected Google account; fields stay editable.
  const [prefill, setPrefill] = useState<Record<string, string | null> | null>(null);
  const prefillKey = prefill ? JSON.stringify(prefill) : "initial";

  return (
    <ActionForm action={action} className="max-w-3xl">
      {trainer ? <input type="hidden" name="id" value={trainer.id} /> : null}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type de formateur</legend>
        <div className="flex gap-6">
          {(["internal", "external"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="accent-primary size-4"
              />
              {TRAINER_TYPE_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {type === "internal" ? (
        <SearchPicker
          name="userId"
          label="Compte Google du collaborateur"
          required
          search={searchUsers}
          initial={trainer?.user}
          hint="Le collaborateur obtient automatiquement le rôle Formateur."
          onChange={(option) => setPrefill(option?.data ?? null)}
        />
      ) : null}

      <div key={prefillKey} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="firstName" label="Prénom" required defaultValue={prefill?.firstName ?? trainer?.firstName} />
          <TextField name="lastName" label="Nom" required defaultValue={prefill?.lastName ?? trainer?.lastName} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="email" label="Email" type="email" required defaultValue={prefill?.email ?? trainer?.email} />
          <TextField name="phone" label="Téléphone" type="tel" defaultValue={trainer?.phone} />
        </div>
      </div>
      {type === "external" ? <TextField name="company" label="Société" defaultValue={trainer?.company} /> : null}
      <TextField
        name="specialties"
        label="Spécialités"
        defaultValue={trainer?.specialties.join(", ")}
        hint="Séparées par des virgules."
      />
      <FileField
        name="cv"
        label={trainer?.cvPath ? "Remplacer le CV" : "CV"}
        accept="application/pdf,.doc,.docx"
        hint="PDF ou Word, 4 Mo maximum."
      />
      {trainer?.cvPath ? (
        <a
          className="text-primary text-sm underline underline-offset-4"
          href={`/fichiers/${trainer.cvPath}`}
          target="_blank"
          rel="noreferrer"
        >
          Voir le CV actuel
        </a>
      ) : null}
      <CheckboxField name="active" label="Formateur actif" defaultChecked={trainer?.active ?? true} />
      <SubmitButton>{trainer ? "Enregistrer" : "Créer le formateur"}</SubmitButton>
    </ActionForm>
  );
}
