"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { anonymizeParticipantAction } from "./actions";

export function AnonymizeDialog({ participantId, name }: { participantId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Anonymiser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anonymiser {name}</DialogTitle>
          <DialogDescription>
            Opération irréversible. Le nom, l&apos;email, le téléphone et la fonction sont effacés, ainsi que les copies
            d&apos;emails et les motivations. Les inscriptions, émargements et attestations sont conservés sans identité
            jusqu&apos;à la fin de la durée de conservation. Pensez à exporter les données si la personne les a
            demandées.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={anonymizeParticipantAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="participantId" value={participantId} />
          <TextareaField name="reason" label="Origine de la demande" required rows={2} />
          <TextField name="confirmation" label="Saisissez ANONYMISER pour confirmer" required autoComplete="off" />
          <SubmitButton variant="destructive">Anonymiser définitivement</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
