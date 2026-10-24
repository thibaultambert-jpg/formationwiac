"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Eye } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField, SelectField, TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LEARNING_RESULT_LABELS } from "@/lib/labels";
import {
  adaptationNeedAction,
  learningAssessmentAction,
  needsAnalysisAction,
  positioningFileAction,
  revealAdaptationNeed,
} from "./pedagogy-actions";

const RESULT_OPTIONS = Object.entries(LEARNING_RESULT_LABELS).map(([value, label]) => ({ value, label }));

export type PedagogyEnrollment = {
  id: string;
  name: string;
  motivation: string | null;
  needsAnalysisNote: string | null;
  needsAnalysisPath: string | null;
  positioningScore: string | null;
  positioningPath: string | null;
  learningResult: string | null;
  learningComment: string | null;
  learningFilePath: string | null;
  learningAssessedBy: string | null;
  hasAdaptationNeed: boolean;
};

function FileLink({ path, label }: { path: string | null; label: string }) {
  if (!path) return null;
  return (
    <a href={`/fichiers/${path}`} target="_blank" rel="noreferrer" className="text-primary text-sm underline">
      {label}
    </a>
  );
}

/** Adaptation need (D8): hidden until an admin asks for it; each reveal is logged. */
function AdaptationNeed({ enrollmentId, present }: { enrollmentId: string; present: boolean }) {
  const [value, setValue] = useState<string | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  if (value === undefined) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          {present ? "Un besoin d'aménagement est renseigné." : "Aucun besoin d'aménagement renseigné."} Donnée à accès
          restreint : chaque consultation est journalisée. Elle n&apos;apparaît dans aucun export ni document.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => setValue(await revealAdaptationNeed(enrollmentId)))}
        >
          <Eye aria-hidden="true" />
          {present ? "Afficher et modifier" : "Renseigner"}
        </Button>
      </div>
    );
  }
  return (
    <ActionForm action={adaptationNeedAction}>
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <TextareaField
        name="adaptationNeed"
        label="Aménagement nécessaire"
        hint="Décrivez uniquement l'aménagement (accès, rythme, supports), sans information de santé."
        defaultValue={value}
        rows={3}
      />
      <SubmitButton variant="outline">Enregistrer l&apos;aménagement</SubmitButton>
    </ActionForm>
  );
}

/** Pedagogical follow-up of an enrollment: needs analysis, entry assessment, learning assessment, adaptation. */
export function PedagogyDialog({ enrollment }: { enrollment: PedagogyEnrollment }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ClipboardList aria-hidden="true" />
          Suivi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Suivi pédagogique de {enrollment.name}</DialogTitle>
          <DialogDescription>
            Analyse du besoin, positionnement à l&apos;entrée, évaluation des acquis et aménagements.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="font-semibold">Analyse du besoin</h3>
          {enrollment.motivation ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Motivation exprimée : </span>
              {enrollment.motivation}
            </p>
          ) : null}
          <FileLink path={enrollment.needsAnalysisPath} label="Voir le recueil du besoin" />
          <ActionForm action={needsAnalysisAction}>
            <input type="hidden" name="enrollmentId" value={enrollment.id} />
            <TextareaField
              name="needsAnalysisNote"
              label="Recueil du besoin (entreprise ou stagiaire)"
              defaultValue={enrollment.needsAnalysisNote}
              rows={3}
            />
            <FileField
              name="needsAnalysisFile"
              label="Document"
              accept="application/pdf,.doc,.docx"
              hint="PDF ou Word, 4 Mo maximum."
            />
            <SubmitButton variant="outline">Enregistrer le besoin</SubmitButton>
          </ActionForm>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">Positionnement à l&apos;entrée</h3>
          <p className="text-sm">
            {enrollment.positioningScore
              ? `Questionnaire de positionnement rempli (score ${enrollment.positioningScore}).`
              : "Questionnaire de positionnement non rempli."}
          </p>
          <FileLink path={enrollment.positioningPath} label="Voir le test téléversé" />
          <ActionForm action={positioningFileAction}>
            <input type="hidden" name="enrollmentId" value={enrollment.id} />
            <FileField
              name="positioningFile"
              label="Test passé hors outil"
              accept="application/pdf,.doc,.docx"
              hint="Remplace ou complète le questionnaire."
            />
            <SubmitButton variant="outline">Téléverser le test</SubmitButton>
          </ActionForm>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">Évaluation des acquis</h3>
          {enrollment.learningResult ? (
            <p className="text-muted-foreground text-sm">
              Saisie par {enrollment.learningAssessedBy ?? "—"}.{" "}
              <FileLink path={enrollment.learningFilePath} label="Voir la pièce jointe" />
            </p>
          ) : null}
          <ActionForm action={learningAssessmentAction}>
            <input type="hidden" name="enrollmentId" value={enrollment.id} />
            <SelectField
              name="learningResult"
              label="Résultat"
              defaultValue={enrollment.learningResult ?? ""}
              options={[{ value: "", label: "—" }, ...RESULT_OPTIONS]}
            />
            <TextareaField
              name="learningComment"
              label="Commentaire (repris sur l'attestation)"
              defaultValue={enrollment.learningComment}
              rows={2}
            />
            <FileField name="learningFile" label="Pièce jointe (quiz, grille…)" accept="application/pdf,.doc,.docx" />
            <SubmitButton variant="outline">Enregistrer l&apos;évaluation</SubmitButton>
          </ActionForm>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">Besoin d&apos;aménagement</h3>
          <AdaptationNeed enrollmentId={enrollment.id} present={enrollment.hasAdaptationNeed} />
        </section>
      </DialogContent>
    </Dialog>
  );
}
