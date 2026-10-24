"use client";

import { useState } from "react";
import { ArrowRightLeft, Building2, FileCheck2, Pencil, Upload, UserPlus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, FileField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SearchPicker } from "@/components/forms/search-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ENROLLMENT_STATUS_LABELS, FUNDING_TYPE_LABELS } from "@/lib/labels";
import { CompanyFields, ContactFields } from "@/app/admin/entreprises/company-fields";
import type { ActionState } from "@/server/forms";
import { searchCompanies, searchExternalParticipants, searchUsers, type SearchOption } from "@/server/search";
import {
  addExternalEnrollment,
  addInternalEnrollment,
  importExternalCsv,
  moveEnrollmentAction,
  updateEnrollmentAction,
  waiveAgreementAction,
} from "./actions";

const FUNDING_OPTIONS = Object.entries(FUNDING_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function AddInternalDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          Ajouter un collaborateur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un collaborateur</DialogTitle>
          <DialogDescription>Recherche parmi les comptes Google déjà connectés à l&apos;application.</DialogDescription>
        </DialogHeader>
        <ActionForm action={addInternalEnrollment}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <SearchPicker name="userId" label="Collaborateur" required search={searchUsers} placeholder="Nom ou email" />
          <TextareaField name="motivation" label="Motivation ou besoin" />
          <CheckboxField name="silent" label="Ne pas envoyer d'email au participant" />
          <SubmitButton>Inscrire</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function ModeToggle({
  name,
  value,
  onChange,
  options,
  legend,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="bg-muted inline-flex rounded-md p-1" role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={
              value === option.value
                ? "bg-background rounded px-3 py-1 text-sm font-medium shadow-xs"
                : "text-muted-foreground hover:text-foreground rounded px-3 py-1 text-sm"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Adds an external participant without leaving the session page: search or
 * create the company and the contact in the same dialog. After each success
 * the dialog stays open on the same company to chain participants.
 */
export function AddExternalDialog({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [companyMode, setCompanyMode] = useState<"existing" | "new">("existing");
  const [company, setCompany] = useState<SearchOption | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [contactMode, setContactMode] = useState<"new" | "existing">("new");

  function reset() {
    setCompanyMode("existing");
    setCompany(null);
    setCompanyName("");
    setContactMode("new");
  }

  function onSuccess(state: ActionState) {
    if (state.status !== "success" || !state.data?.companyId) return;
    setCompany({
      id: state.data.companyId,
      label: state.data.companyName,
      description: state.data.companyDescription || undefined,
    });
    setCompanyMode("existing");
    setContactMode("new");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} title={disabled ? "Session non ouverte aux externes" : undefined}>
          <Building2 aria-hidden="true" />
          Ajouter un externe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter un participant externe</DialogTitle>
          <DialogDescription>
            Recherchez l&apos;entreprise et le contact, ou créez-les directement ici.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={addExternalEnrollment} onSuccess={onSuccess}>
          <input type="hidden" name="sessionId" value={sessionId} />

          <section className="space-y-3" aria-labelledby="external-company">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="external-company" className="font-medium">
                Entreprise
              </h3>
              <ModeToggle
                name="companyMode"
                legend="Entreprise existante ou nouvelle"
                value={companyMode}
                onChange={(value) => setCompanyMode(value as "existing" | "new")}
                options={[
                  { value: "existing", label: "Existante" },
                  { value: "new", label: "Nouvelle" },
                ]}
              />
            </div>
            {companyMode === "existing" ? (
              <SearchPicker
                key={company?.id ?? "none"}
                name="companyId"
                label="Rechercher une entreprise"
                required
                search={searchCompanies}
                initial={company}
                placeholder="Raison sociale ou SIRET"
                onChange={setCompany}
                footer={(query) => (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() => {
                      setCompanyName(query);
                      setCompanyMode("new");
                    }}
                  >
                    + Créer {query.trim() ? `« ${query.trim()} »` : "une nouvelle entreprise"}
                  </Button>
                )}
              />
            ) : (
              <CompanyFields
                prefix="company."
                compact
                company={{
                  name: companyName,
                  siret: null,
                  addressLine: null,
                  postalCode: null,
                  city: null,
                  billingEmail: null,
                  hubspotCompanyId: null,
                }}
              />
            )}
          </section>

          <section className="space-y-3 border-t pt-4" aria-labelledby="external-contact">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="external-contact" className="font-medium">
                Participant
              </h3>
              <ModeToggle
                name="contactMode"
                legend="Nouveau participant ou contact existant"
                value={contactMode}
                onChange={(value) => setContactMode(value as "new" | "existing")}
                options={[
                  { value: "new", label: "Nouveau" },
                  { value: "existing", label: "Contact existant" },
                ]}
              />
            </div>
            {contactMode === "existing" ? (
              <SearchPicker
                key={`contact-${company?.id ?? "all"}`}
                name="participantId"
                label={company && companyMode === "existing" ? `Contacts de ${company.label}` : "Rechercher un contact"}
                required
                search={(q) => searchExternalParticipants(q, companyMode === "existing" ? company?.id : undefined)}
                placeholder="Nom ou email"
              />
            ) : (
              <ContactFields prefix="contact." />
            )}
          </section>

          <SelectField
            name="fundingType"
            label="Financement"
            defaultValue="company"
            options={FUNDING_OPTIONS}
            hint="OPCO, CPF, France Travail ou Région : la session entre dans le périmètre Qualiopi."
          />
          <p className="text-muted-foreground text-sm">
            L&apos;inscription reste « En attente de convention » jusqu&apos;à la signature de la convention de
            formation (onglet Conventions) ou une dérogation motivée.
          </p>
          <CheckboxField name="silent" label="Ne pas envoyer d'email au participant" />
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Inscrire</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Terminer
            </Button>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function ImportCsvDialog({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Upload aria-hidden="true" />
          Importer un CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importer des participants externes</DialogTitle>
          <DialogDescription>
            Fichier CSV (séparateur « ; » ou « , ») avec les colonnes <strong>entreprise</strong>,{" "}
            <strong>prenom</strong>, <strong>nom</strong>, <strong>email</strong> et, en option, <strong>siret</strong>,{" "}
            <strong>fonction</strong>, <strong>telephone</strong>. Les entreprises et contacts existants sont retrouvés
            par SIRET, nom et email.
          </DialogDescription>
        </DialogHeader>
        <a
          href="/modele-import-participants.csv"
          download
          className="text-primary text-sm underline underline-offset-4"
        >
          Télécharger le modèle de fichier
        </a>
        <ActionForm action={importExternalCsv}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <FileField name="file" label="Fichier CSV" required accept=".csv,text/csv" />
          <CheckboxField name="silent" label="Ne pas envoyer d'email aux participants importés" />
          <SubmitButton>Importer</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_OPTIONS = Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export function EditEnrollmentDialog({
  enrollment,
}: {
  enrollment: {
    id: string;
    name: string;
    status: string;
    external: boolean;
    fundingType: string;
    appliedPrice: string | undefined;
    billingCompany: SearchOption | null;
    cancellationReason: string | null;
    dropoutReason: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden="true" />
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inscription de {enrollment.name}</DialogTitle>
          <DialogDescription>
            Annuler une inscription confirmée libère une place : la première personne en liste d&apos;attente est
            inscrite.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={updateEnrollmentAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="enrollmentId" value={enrollment.id} />
          <SelectField name="status" label="Statut" defaultValue={enrollment.status} options={STATUS_OPTIONS} />
          <TextareaField
            name="cancellationReason"
            label="Motif d'annulation"
            defaultValue={enrollment.cancellationReason}
            rows={2}
          />
          <TextareaField
            name="dropoutReason"
            label="Motif d'abandon"
            hint="Obligatoire avec le statut « Abandon » (formation commencée)."
            defaultValue={enrollment.dropoutReason}
            rows={2}
          />
          <SelectField
            name="fundingType"
            label="Financement"
            defaultValue={enrollment.fundingType}
            options={FUNDING_OPTIONS}
          />
          {enrollment.external ? (
            <>
              <TextField
                name="appliedPrice"
                label="Prix appliqué HT (€)"
                inputMode="decimal"
                defaultValue={enrollment.appliedPrice}
              />
              <SearchPicker
                name="billingCompanyId"
                label="Entreprise payeuse"
                search={searchCompanies}
                initial={enrollment.billingCompany}
              />
            </>
          ) : null}
          <SubmitButton>Enregistrer</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function MoveEnrollmentDialog({
  enrollment,
  targets,
}: {
  enrollment: { id: string; name: string };
  targets: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={targets.length === 0}>
          <ArrowRightLeft aria-hidden="true" />
          Déplacer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déplacer {enrollment.name}</DialogTitle>
          <DialogDescription>
            L&apos;inscription est transférée vers la session choisie, en liste d&apos;attente si elle est complète.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={moveEnrollmentAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="enrollmentId" value={enrollment.id} />
          <SelectField
            name="targetSessionId"
            label="Session de destination"
            required
            placeholder="Choisir une session"
            options={targets.map((target) => ({ value: target.id, label: target.label }))}
          />
          <SubmitButton>Déplacer</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Admin waiver of the training agreement (B2): the reason is mandatory and traced. */
export function WaiveAgreementDialog({ enrollment }: { enrollment: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FileCheck2 aria-hidden="true" />
          Déroger
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer sans convention</DialogTitle>
          <DialogDescription>
            L&apos;inscription de {enrollment.name} sera confirmée sans convention signée. La dérogation et son motif
            sont conservés dans l&apos;historique et repris dans le dossier de la session.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={waiveAgreementAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="enrollmentId" value={enrollment.id} />
          <TextareaField name="reason" label="Motif de la dérogation" required rows={3} />
          <SubmitButton>Confirmer avec dérogation</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
