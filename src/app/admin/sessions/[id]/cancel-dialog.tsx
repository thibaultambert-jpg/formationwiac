"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelSession } from "../actions";

export function CancelSessionDialog({ sessionId, enrolled }: { sessionId: string; enrolled: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Annuler la session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler la session</DialogTitle>
          <DialogDescription>
            L&apos;annulation est définitive.{" "}
            {enrolled > 0 ? `${enrolled} inscription(s) active(s) sont concernées.` : ""}
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={cancelSession} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="id" value={sessionId} />
          <TextareaField name="reason" label="Motif de l'annulation" required />
          <SubmitButton variant="destructive">Confirmer l&apos;annulation</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
