"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField, TextareaField, TextField } from "@/components/forms/fields";
import { saveLegalInformation, uploadRegulation } from "./actions";

type LegalValues = {
  dpoContact: string | null;
  disabilityReferentName: string | null;
  disabilityReferentEmail: string | null;
  disabilityReferentPhone: string | null;
  pedagogicalContact: string | null;
  administrativeContact: string | null;
  privacyNotice: string;
  privacyPolicy: string;
  legalNotice: string;
};

export function LegalForm({ values }: { values: LegalValues }) {
  return (
    <ActionForm action={saveLegalInformation} className="max-w-3xl">
      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Contacts</legend>
        <TextField
          name="dpoContact"
          label="Contact protection des données (DPO)"
          hint="Adresse email ou postale où exercer ses droits."
          defaultValue={values.dpoContact}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="disabilityReferentName"
            label="Référent handicap"
            defaultValue={values.disabilityReferentName}
          />
          <TextField
            name="disabilityReferentEmail"
            label="Email du référent handicap"
            type="email"
            defaultValue={values.disabilityReferentEmail}
          />
          <TextField
            name="disabilityReferentPhone"
            label="Téléphone du référent handicap"
            defaultValue={values.disabilityReferentPhone}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="pedagogicalContact"
            label="Référent pédagogique"
            hint="Nom et coordonnées."
            defaultValue={values.pedagogicalContact}
          />
          <TextField
            name="administrativeContact"
            label="Référent administratif"
            hint="Nom et coordonnées."
            defaultValue={values.administrativeContact}
          />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 font-semibold">Textes</legend>
        <p className="text-muted-foreground text-sm">
          Les textes proposés sont des modèles construits à partir des paramètres, à faire valider par votre DPO. Un
          texte laissé tel quel suit les paramètres ; modifiez-le pour le figer. Une ligne courte sans ponctuation
          finale, suivie d&apos;une ligne vide, devient un titre.
        </p>
        <TextareaField
          name="privacyNotice"
          label="Mention d'information courte"
          hint="Affichée sur les pages d'émargement et d'évaluation et à la fin des convocations."
          rows={5}
          defaultValue={values.privacyNotice}
        />
        <TextareaField
          name="privacyPolicy"
          label="Politique de confidentialité (page /confidentialite)"
          rows={16}
          defaultValue={values.privacyPolicy}
        />
        <TextareaField
          name="legalNotice"
          label="Mentions légales (page /mentions-legales)"
          rows={10}
          defaultValue={values.legalNotice}
        />
      </fieldset>
      <SubmitButton>Enregistrer</SubmitButton>
    </ActionForm>
  );
}

export function RegulationForm() {
  return (
    <ActionForm action={uploadRegulation} className="max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <FileField name="file" label="Règlement intérieur (PDF)" accept="application/pdf" required />
        <TextField name="effectiveFrom" label="En vigueur à partir du" type="date" required />
      </div>
      <SubmitButton variant="outline">Ajouter une version</SubmitButton>
    </ActionForm>
  );
}
