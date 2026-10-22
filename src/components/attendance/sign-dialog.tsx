"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
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
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  buttonLabel: string;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
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
          <SignaturePad />
          <SubmitButton>Valider la signature</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
