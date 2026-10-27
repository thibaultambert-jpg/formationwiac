"use client";

import { useState } from "react";
import { FileX2, Send } from "lucide-react";
import { ActionForm, SubmitButton, useActionFormState } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_STATUS_TONES } from "@/lib/labels";
import { decimalInput, formatDecimal, formatEuros, parseFrenchDecimal } from "@/server/domain/numbers";
import { createInvoiceAction, detachInvoiceAction } from "./actions";

export type InvoiceFormLine = {
  enrollmentId: string;
  name: string;
  status: keyof typeof ENROLLMENT_STATUS_LABELS;
  signedHours: number;
  appliedPrice: number | null;
  proposal: { include: boolean; amount: number };
};

function LineRow({ line, durationHours }: { line: InvoiceFormLine; durationHours: number }) {
  const { state } = useActionFormState();
  const echoed = state.status === "error" ? state.values : undefined;
  const id = line.enrollmentId;
  const [include, setInclude] = useState(echoed ? `include_${id}` in echoed : line.proposal.include);
  const [amount, setAmount] = useState(echoed?.[`amount_${id}`] ?? decimalInput(line.proposal.amount) ?? "");
  const value = include ? parseFrenchDecimal(amount) : 0;
  const adjusted = value !== null && !Number.isNaN(value) && Math.abs(value - line.proposal.amount) >= 0.005;
  return (
    <TableRow>
      <TableCell>
        <input type="hidden" name="enrollmentId" value={id} />
        <input type="hidden" name={`proposed_${id}`} value={line.proposal.amount} />
        <div className="flex items-center gap-2">
          <Checkbox
            id={`include_${id}`}
            name={`include_${id}`}
            checked={include}
            onChange={(event) => setInclude(event.target.checked)}
          />
          <label htmlFor={`include_${id}`} className="font-medium">
            {line.name}
          </label>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={ENROLLMENT_STATUS_TONES[line.status]}>{ENROLLMENT_STATUS_LABELS[line.status]}</Badge>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {formatDecimal(line.signedHours)} h / {formatDecimal(durationHours)} h
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">{formatEuros(line.appliedPrice)}</TableCell>
      <TableCell>
        <Input
          name={`amount_${id}`}
          inputMode="decimal"
          value={include ? amount : "0"}
          onChange={(event) => setAmount(event.target.value)}
          disabled={!include}
          aria-label={`Montant HT facturé pour ${line.name}`}
          className="w-28 text-right"
        />
      </TableCell>
      <TableCell>
        <Input
          name={`reason_${id}`}
          defaultValue={echoed?.[`reason_${id}`]}
          required={adjusted}
          placeholder={adjusted ? "Motif obligatoire" : "—"}
          aria-label={`Motif de l'ajustement pour ${line.name}`}
          className="min-w-48"
        />
      </TableCell>
    </TableRow>
  );
}

function Total({ lines }: { lines: readonly InvoiceFormLine[] }) {
  // Indicative only: the server recomputes the total from the submitted lines.
  const total = lines.reduce((sum, line) => sum + (line.proposal.include ? line.proposal.amount : 0), 0);
  return <span>Montant proposé : {formatEuros(total)} HT</span>;
}

export function CreateInvoiceForm({
  sessionId,
  companyId,
  lines,
  durationHours,
  vatLabel,
  disabled,
}: {
  sessionId: string;
  companyId: string;
  lines: readonly InvoiceFormLine[];
  durationHours: number;
  vatLabel: string;
  disabled: boolean;
}) {
  return (
    <ActionForm action={createInvoiceAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="companyId" value={companyId} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Participant</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Heures signées</TableHead>
            <TableHead className="text-right">Prix appliqué HT</TableHead>
            <TableHead>Montant facturé HT</TableHead>
            <TableHead>Motif si ajusté</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <LineRow key={line.enrollmentId} line={line} durationHours={durationHours} />
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          <Total lines={lines} /> · {vatLabel}
        </p>
        {disabled ? null : (
          <SubmitButton>
            <Send aria-hidden="true" />
            Créer la facture brouillon dans Pennylane
          </SubmitButton>
        )}
      </div>
    </ActionForm>
  );
}

export function DetachInvoiceDialog({ sessionId, invoiceId }: { sessionId: string; invoiceId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileX2 aria-hidden="true" />
          Détacher
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Détacher la facture</DialogTitle>
          <DialogDescription>
            Les participants pourront être facturés de nouveau. Supprimez d&apos;abord le brouillon dans Pennylane, ou
            émettez-y un avoir si la facture a été finalisée.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={detachInvoiceAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <TextField name="reason" label="Motif" required />
          <SubmitButton variant="destructive">Détacher la facture</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
