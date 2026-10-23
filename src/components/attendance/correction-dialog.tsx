"use client";

import { useState } from "react";
import { ClipboardPen } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
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

const STATE_OPTIONS = [
  { value: "absent", label: "Absent(e)" },
  { value: "late", label: "Retard" },
  { value: "left_early", label: "Départ anticipé" },
  { value: "present", label: "Présent(e) sans signature" },
];

/**
 * Appends an attendance correction (C3, C5): the signature is never
 * overwritten, the reason is mandatory and the author is recorded.
 */
export function CorrectionDialog({
  action,
  hidden,
  participant,
  slotLabel,
  states = STATE_OPTIONS.map((option) => option.value),
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  participant: string;
  slotLabel: string;
  states?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(states[0]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <ClipboardPen aria-hidden="true" />
          Corriger
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corriger l&apos;émargement de {participant}</DialogTitle>
          <DialogDescription>
            {slotLabel}. La correction s&apos;ajoute à l&apos;historique avec son motif et son auteur ; la signature
            n&apos;est jamais modifiée.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} hideSuccess onSuccess={() => setOpen(false)}>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div onChange={(event) => setState((event.target as unknown as HTMLSelectElement).value)}>
            <SelectField
              name="state"
              label="Situation"
              defaultValue={state}
              options={STATE_OPTIONS.filter((option) => states.includes(option.value))}
            />
          </div>
          {state === "late" || state === "left_early" ? (
            <TextField
              name="time"
              type="time"
              required
              label={state === "late" ? "Heure d'arrivée" : "Heure de départ"}
            />
          ) : null}
          <TextareaField name="reason" label="Motif" required rows={2} />
          <SubmitButton>Enregistrer la correction</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
