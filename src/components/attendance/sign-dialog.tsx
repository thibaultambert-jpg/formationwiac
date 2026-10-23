"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField } from "@/components/forms/fields";
import { SignaturePad } from "@/components/forms/signature-pad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/server/forms";

export function SignDialog({
  action,
  hidden,
  buttonLabel,
  title,
  description,
  allowAttestation = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  buttonLabel: string;
  title: string;
  description: string;
  /** Offers the checkbox attestation, an accessible alternative to the drawn signature (H1). */
  allowAttestation?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"draw" | "checkbox">("draw");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PenLine aria-hidden="true" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} hideSuccess onSuccess={() => setOpen(false)}>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {allowAttestation ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Mode d&apos;émargement</legend>
              <input type="hidden" name="mode" value={mode} />
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="signMode"
                    className="size-5"
                    checked={mode === "draw"}
                    onChange={() => setMode("draw")}
                  />
                  Signer à main levée
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="signMode"
                    className="size-5"
                    checked={mode === "checkbox"}
                    onChange={() => setMode("checkbox")}
                  />
                  Certifier ma présence sans dessiner
                </label>
              </div>
            </fieldset>
          ) : null}
          {mode === "draw" ? (
            <SignaturePad />
          ) : (
            <CheckboxField
              name="attest"
              label="Je certifie sur l'honneur être présent(e) à cette demi-journée de formation."
            />
          )}
          <SubmitButton>{mode === "draw" ? "Valider la signature" : "Certifier ma présence"}</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
