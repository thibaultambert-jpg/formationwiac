"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { SelectField } from "@/components/forms/fields";
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
import { searchCompanies } from "@/server/search";
import { createCompanyAction, mergeCompanyAction, saveContactAction, updateCompanyAction } from "./actions";
import { CompanyFields, ContactFields, type CompanyValues, type ContactValues } from "./company-fields";

export function NewCompanyForm() {
  return (
    <ActionForm action={createCompanyAction} className="max-w-3xl">
      <CompanyFields />
      <SubmitButton>Créer l&apos;entreprise</SubmitButton>
    </ActionForm>
  );
}

export function EditCompanyForm({
  company,
  contacts,
}: {
  company: CompanyValues & { id: string; mainContactId: string | null };
  contacts: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={updateCompanyAction} className="max-w-3xl">
      <input type="hidden" name="id" value={company.id} />
      <CompanyFields company={company} />
      <SelectField
        name="mainContactId"
        label="Contact principal"
        defaultValue={company.mainContactId}
        placeholder="Aucun"
        options={contacts.map((contact) => ({ value: contact.id, label: contact.name }))}
      />
      <SubmitButton>Enregistrer</SubmitButton>
    </ActionForm>
  );
}

export function ContactDialog({ companyId, contact }: { companyId: string; contact?: ContactValues & { id: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {contact ? (
          <Button variant="ghost" size="sm">
            <Pencil aria-hidden="true" />
            Modifier
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus aria-hidden="true" />
            Ajouter un contact
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
          <DialogDescription>Participant externe rattaché à cette entreprise.</DialogDescription>
        </DialogHeader>
        <ActionForm action={saveContactAction} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="companyId" value={companyId} />
          {contact ? <input type="hidden" name="participantId" value={contact.id} /> : null}
          <ContactFields contact={contact} />
          <SubmitButton>{contact ? "Enregistrer" : "Ajouter"}</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function MergeCompanyForm({ targetId }: { targetId: string }) {
  return (
    <ActionForm action={mergeCompanyAction}>
      <input type="hidden" name="targetId" value={targetId} />
      <SearchPicker
        name="duplicateId"
        label="Entreprise en doublon à fusionner dans cette fiche"
        search={searchCompanies}
        hint="Ses contacts et inscriptions facturées seront rattachés ici, puis elle sera archivée."
      />
      <SubmitButton variant="outline">Fusionner</SubmitButton>
    </ActionForm>
  );
}
