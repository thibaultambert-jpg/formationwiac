"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { COMPLAINT_STATUS_LABELS, IMPROVEMENT_SOURCE_LABELS, IMPROVEMENT_STATUS_LABELS } from "@/lib/labels";
import { saveComplaintAction, saveImprovementAction } from "./actions";

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export type ComplaintValues = {
  id?: string;
  receivedAt: string;
  complainant: string | null;
  channel: string | null;
  sessionId: string | null;
  subject: string | null;
  description: string | null;
  treatment: string | null;
  response: string | null;
  status: string;
};

export function ComplaintForm({
  values,
  sessions,
}: {
  values: ComplaintValues;
  sessions: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={saveComplaintAction} className="max-w-3xl">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="receivedAt" label="Reçue le" type="date" required defaultValue={values.receivedAt} />
        <TextField name="complainant" label="Émetteur" required defaultValue={values.complainant} />
        <TextField name="channel" label="Canal" hint="Email, téléphone, questionnaire…" defaultValue={values.channel} />
      </div>
      <SelectField
        name="sessionId"
        label="Session concernée"
        defaultValue={values.sessionId ?? ""}
        options={[{ value: "", label: "Aucune" }, ...sessions]}
      />
      <TextField name="subject" label="Objet" required defaultValue={values.subject} />
      <TextareaField name="description" label="Description" required rows={4} defaultValue={values.description} />
      <TextareaField name="treatment" label="Analyse et traitement" rows={3} defaultValue={values.treatment} />
      <TextareaField name="response" label="Réponse apportée" rows={3} defaultValue={values.response} />
      <SelectField
        name="status"
        label="Statut"
        defaultValue={values.status}
        options={options(COMPLAINT_STATUS_LABELS)}
      />
      <SubmitButton>{values.id ? "Enregistrer" : "Créer la réclamation"}</SubmitButton>
    </ActionForm>
  );
}

export type ImprovementValues = {
  id?: string;
  source: string;
  complaintId: string | null;
  origin: string | null;
  action: string | null;
  owner: string | null;
  dueDate: string | null;
  status: string;
  result: string | null;
};

export function ImprovementForm({
  values,
  complaints,
}: {
  values: ImprovementValues;
  complaints: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={saveImprovementAction} className="max-w-3xl">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="source"
          label="Source"
          defaultValue={values.source}
          options={options(IMPROVEMENT_SOURCE_LABELS)}
        />
        <SelectField
          name="complaintId"
          label="Réclamation d'origine"
          defaultValue={values.complaintId ?? ""}
          options={[{ value: "", label: "Aucune" }, ...complaints]}
        />
      </div>
      <TextField
        name="origin"
        label="Constat d'origine"
        hint="Résultat de questionnaire, remarque d'audit…"
        defaultValue={values.origin}
      />
      <TextareaField name="action" label="Action d'amélioration" required rows={3} defaultValue={values.action} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="owner" label="Responsable" defaultValue={values.owner} />
        <TextField name="dueDate" label="Échéance" type="date" defaultValue={values.dueDate} />
        <SelectField
          name="status"
          label="Statut"
          defaultValue={values.status}
          options={options(IMPROVEMENT_STATUS_LABELS)}
        />
      </div>
      <TextareaField name="result" label="Résultat et mesure de l'efficacité" rows={2} defaultValue={values.result} />
      <SubmitButton variant={values.id ? "outline" : "default"}>
        {values.id ? "Enregistrer" : "Ajouter l'action"}
      </SubmitButton>
    </ActionForm>
  );
}
