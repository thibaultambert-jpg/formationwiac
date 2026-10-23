"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { runAutomationNow, saveDelays, saveQuestion } from "./actions";

const ANSWER_TYPES = [
  { value: "scale_1_5", label: "Échelle de 1 à 5" },
  { value: "scale_0_10", label: "Échelle de 0 à 10" },
  { value: "single_choice", label: "Choix unique" },
  { value: "choice_with_other", label: "Choix avec précision" },
  { value: "text", label: "Texte libre" },
];

export function DelaysForm({
  settings,
}: {
  settings: { reminderDaysBefore: number; coldEvaluationDays: number; evaluationReminderDays: number };
}) {
  return (
    <ActionForm action={saveDelays} className="grid max-w-3xl gap-4 space-y-0 sm:grid-cols-3 sm:items-end">
      <TextField
        name="reminderDaysBefore"
        label="Rappel avant la session (jours)"
        type="number"
        min={0}
        defaultValue={settings.reminderDaysBefore}
      />
      <TextField
        name="coldEvaluationDays"
        label="Évaluation à froid (jours après)"
        type="number"
        min={7}
        defaultValue={settings.coldEvaluationDays}
      />
      <TextField
        name="evaluationReminderDays"
        label="Relance d'évaluation (jours)"
        type="number"
        min={1}
        defaultValue={settings.evaluationReminderDays}
      />
      <SubmitButton className="sm:col-span-3 sm:w-fit">Enregistrer les délais</SubmitButton>
    </ActionForm>
  );
}

export type QuestionValues = {
  id: string;
  evaluationType: string;
  label: string;
  answerType: string;
  options: string[];
  position: number;
  required: boolean;
  active: boolean;
};

export function QuestionForm({ question, evaluationType }: { question?: QuestionValues; evaluationType: string }) {
  return (
    <ActionForm
      action={saveQuestion}
      hideSuccess={Boolean(question)}
      className="grid gap-3 space-y-0 md:grid-cols-[4rem_1fr_12rem]"
    >
      {question ? <input type="hidden" name="id" value={question.id} /> : null}
      <input type="hidden" name="evaluationType" value={evaluationType} />
      <TextField name="position" label="Ordre" type="number" defaultValue={question?.position} />
      <TextField
        name="label"
        label={question ? "Libellé" : "Nouvelle question"}
        required
        defaultValue={question?.label}
      />
      <SelectField
        name="answerType"
        label="Type de réponse"
        defaultValue={question?.answerType ?? "scale_1_5"}
        options={ANSWER_TYPES}
      />
      <TextareaField
        name="options"
        label="Choix (un par ligne)"
        rows={2}
        defaultValue={question?.options.join("\n")}
        className="md:col-span-2 md:col-start-2"
      />
      <div className="flex flex-col gap-2 md:col-start-3">
        <CheckboxField name="required" label="Obligatoire" defaultChecked={question?.required ?? true} />
        {question ? <CheckboxField name="active" label="Active" defaultChecked={question.active} /> : null}
      </div>
      <SubmitButton variant={question ? "outline" : "default"} className="w-fit md:col-start-2">
        {question ? "Enregistrer" : "Ajouter la question"}
      </SubmitButton>
    </ActionForm>
  );
}

export function RunAutomationForm() {
  return (
    <ActionForm action={runAutomationNow}>
      <SubmitButton variant="outline">Exécuter les tâches automatiques maintenant</SubmitButton>
    </ActionForm>
  );
}
