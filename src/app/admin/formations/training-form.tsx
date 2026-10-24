"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, FileField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { MODALITY_LABELS } from "@/lib/labels";
import type { ActionState } from "@/server/forms";

export type TrainingFormValues = {
  id: string;
  title: string;
  slug: string;
  themeId: string | null;
  objectives: string;
  prerequisites: string | null;
  targetAudience: string | null;
  programText: string | null;
  thingsToBring: string | null;
  accessDelay: string | null;
  teachingMethods: string | null;
  evaluationMethods: string | null;
  accessibility: string | null;
  programPdfPath: string | null;
  durationHours: string;
  modality: string;
  priceExclTax: string | undefined;
  active: boolean;
};

const MODALITY_OPTIONS = Object.entries(MODALITY_LABELS).map(([value, label]) => ({ value, label }));

export function TrainingForm({
  action,
  training,
  themes,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  training?: TrainingFormValues;
  themes: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={action} className="max-w-3xl">
      {training ? <input type="hidden" name="id" value={training.id} /> : null}
      <TextField name="title" label="Titre" required defaultValue={training?.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="themeId"
          label="Thème"
          defaultValue={training?.themeId}
          placeholder="Aucun thème"
          options={themes.map((theme) => ({ value: theme.id, label: theme.name }))}
        />
        <TextField
          name="slug"
          label="Identifiant d'URL"
          defaultValue={training?.slug}
          hint={training ? undefined : "Généré à partir du titre si vide."}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="modality"
          label="Modalité"
          required
          defaultValue={training?.modality ?? "in_person"}
          options={MODALITY_OPTIONS}
        />
        <TextField
          name="durationHours"
          label="Durée (heures)"
          required
          inputMode="decimal"
          defaultValue={training?.durationHours}
        />
        <TextField
          name="priceExclTax"
          label="Prix HT par participant (€)"
          inputMode="decimal"
          defaultValue={training?.priceExclTax}
        />
      </div>
      <TextareaField
        name="objectives"
        label="Objectifs pédagogiques"
        required
        rows={4}
        defaultValue={training?.objectives}
      />
      <TextareaField name="prerequisites" label="Prérequis" defaultValue={training?.prerequisites} />
      <TextareaField name="targetAudience" label="Public visé" defaultValue={training?.targetAudience} />
      <TextareaField name="programText" label="Programme" rows={8} defaultValue={training?.programText} />
      <TextareaField
        name="thingsToBring"
        label="Matériel ou documents à prévoir"
        hint="Repris dans la convocation (ordinateur, pièce d'identité, supports…)."
        defaultValue={training?.thingsToBring}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextareaField
          name="teachingMethods"
          label="Méthodes pédagogiques"
          hint="Repris dans l'information préalable."
          defaultValue={training?.teachingMethods}
        />
        <TextareaField
          name="evaluationMethods"
          label="Modalités d'évaluation"
          hint="Évaluation des acquis, quiz, mise en situation…"
          defaultValue={training?.evaluationMethods}
        />
        <TextareaField
          name="accessDelay"
          label="Délai d'accès"
          hint="Par exemple : inscription jusqu'à 7 jours avant la session."
          defaultValue={training?.accessDelay}
        />
        <TextareaField
          name="accessibility"
          label="Accessibilité et adaptations"
          hint="Accès des personnes en situation de handicap, adaptations possibles."
          defaultValue={training?.accessibility}
        />
      </div>
      <FileField
        name="programPdf"
        label={training?.programPdfPath ? "Remplacer le programme PDF" : "Programme PDF"}
        accept="application/pdf"
        hint="PDF, 4 Mo maximum."
      />
      {training?.programPdfPath ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a
            className="text-primary underline underline-offset-4"
            href={`/fichiers/${training.programPdfPath}`}
            target="_blank"
            rel="noreferrer"
          >
            Voir le programme actuel
          </a>
          <CheckboxField name="removeProgramPdf" label="Retirer le programme PDF" />
        </div>
      ) : null}
      <CheckboxField
        name="active"
        label="Formation active"
        hint="Une formation archivée n'est plus proposée à la création de sessions."
        defaultChecked={training?.active ?? true}
      />
      <SubmitButton>{training ? "Enregistrer" : "Créer la formation"}</SubmitButton>
    </ActionForm>
  );
}
