"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, useFieldValue } from "@/components/forms/action-form";
import { TextareaField, TextField } from "@/components/forms/fields";
import { renderTemplate, TEMPLATE_VARIABLES } from "@/server/email/template";
import { saveEmailTemplate } from "./actions";

const SAMPLE = {
  prenom: "Inès",
  nom: "Durand",
  formation: "Manager une équipe au quotidien",
  reference: "FORM-2026-014",
  dates: "- lundi 16/11/2026 09:00–12:30\n- lundi 16/11/2026 13:30–17:00",
  lieu: "Salle Lumière, Paris",
  lien_visio: "https://meet.google.com/abc-defg-hij",
  motif: "Formateur indisponible",
  lien_espace: "https://formations.exemple.fr/mes-formations",
  organisme: "Organisme de formation",
};

export function TemplateForm({ template }: { template: { key: string; subject: string; body: string } }) {
  return (
    <ActionForm action={saveEmailTemplate} className="grid gap-8 space-y-0 lg:grid-cols-2">
      <Editor template={template} />
    </ActionForm>
  );
}

function Editor({ template }: { template: { key: string; subject: string; body: string } }) {
  const [subject, setSubject] = useState(useFieldValue("subject", template.subject) ?? "");
  const [body, setBody] = useState(useFieldValue("body", template.body) ?? "");
  return (
    <>
      <div
        className="space-y-4"
        onInput={(event) => {
          const target = event.target as HTMLInputElement | HTMLTextAreaElement;
          if (target.name === "subject") setSubject(target.value);
          if (target.name === "body") setBody(target.value);
        }}
      >
        <input type="hidden" name="key" value={template.key} />
        <TextField name="subject" label="Objet" required defaultValue={template.subject} />
        <TextareaField name="body" label="Contenu" required rows={14} defaultValue={template.body} />
        <div className="text-sm">
          <p className="mb-1 font-medium">Variables disponibles</p>
          <ul className="text-muted-foreground grid gap-x-4 sm:grid-cols-2">
            {Object.entries(TEMPLATE_VARIABLES).map(([name, label]) => (
              <li key={name}>
                <code className="text-foreground">{`{{${name}}}`}</code> : {label}
              </li>
            ))}
          </ul>
        </div>
        <SubmitButton>Enregistrer</SubmitButton>
      </div>
      <section aria-labelledby="preview-title" className="space-y-2">
        <h2 id="preview-title" className="font-medium">
          Aperçu avec des données d&apos;exemple
        </h2>
        <div className="rounded-md border">
          <p className="border-b px-4 py-2 text-sm">
            <span className="text-muted-foreground">Objet : </span>
            {renderTemplate(subject, SAMPLE)}
          </p>
          <pre className="p-4 font-sans text-sm whitespace-pre-wrap">{renderTemplate(body, SAMPLE)}</pre>
        </div>
      </section>
    </>
  );
}
