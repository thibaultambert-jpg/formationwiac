"use client";

import { useState } from "react";
import { FilePlus2, FileSignature, RefreshCw } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createConventionAction, recordSignedConventionAction, refreshConventionAction } from "./actions";

const TERMS_HINT = "Modalités de paiement, prise en charge par un financeur, échéancier… Reprises à l'article 4.";

export function CreateConventionDialog({
  sessionId,
  company,
}: {
  sessionId: string;
  company: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FilePlus2 aria-hidden="true" />
          Générer la convention
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convention avec {company.name}</DialogTitle>
          <DialogDescription>
            La convention couvre les inscriptions de l&apos;entreprise qui n&apos;en ont pas encore. Le prix est la
            somme des prix appliqués.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={createConventionAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="companyId" value={company.id} />
          <TextareaField name="financialTerms" label="Conditions financières" hint={TERMS_HINT} rows={3} />
          <SubmitButton>Générer le PDF</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function RefreshConventionDialog({
  convention,
}: {
  convention: { id: string; reference: string; financialTerms: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <RefreshCw aria-hidden="true" />
          Mettre à jour
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mettre à jour la convention {convention.reference}</DialogTitle>
          <DialogDescription>
            Ajoute les nouvelles inscriptions de l&apos;entreprise et régénère le PDF. La version précédente est
            conservée.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={refreshConventionAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="conventionId" value={convention.id} />
          <TextareaField
            name="financialTerms"
            label="Conditions financières"
            hint={TERMS_HINT}
            rows={3}
            defaultValue={convention.financialTerms}
          />
          <SubmitButton>Régénérer le PDF</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function RecordSignedDialog({ convention }: { convention: { id: string; reference: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="cta">
          <FileSignature aria-hidden="true" />
          Convention signée
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer la convention signée {convention.reference}</DialogTitle>
          <DialogDescription>
            Les inscriptions en attente de cette convention passent en « Confirmée » et les participants reçoivent leur
            confirmation.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={recordSignedConventionAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="conventionId" value={convention.id} />
          <FileField name="signedFile" label="Convention signée (PDF)" required accept="application/pdf" />
          <TextField name="signedAt" label="Date de signature" type="date" required />
          <SubmitButton>Enregistrer</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
