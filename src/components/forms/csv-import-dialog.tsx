"use client";

import { Download, Upload } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField } from "@/components/forms/fields";
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

/**
 * CSV import of a list (sessions, trainers, companies, enrollees): file field,
 * template download and the import report shown by the action's result.
 */
export function CsvImportDialog({
  title,
  description,
  templateHref,
  action,
  disabled,
  children,
}: {
  title: string;
  description: React.ReactNode;
  templateHref: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  disabled?: boolean;
  /** Extra fields (hidden ids, options). */
  children?: React.ReactNode;
}) {
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <a
          href={templateHref}
          download
          className="text-primary inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
        >
          <Download aria-hidden="true" className="size-4" />
          Télécharger le fichier exemple
        </a>
        <ActionForm action={action}>
          {children}
          <FileField name="file" label="Fichier CSV" required accept=".csv,text/csv" />
          <SubmitButton>Importer</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
