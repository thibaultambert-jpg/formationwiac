"use client";

import { TextField } from "@/components/forms/fields";

export type CompanyValues = {
  name: string;
  siret: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  billingEmail: string | null;
  hubspotCompanyId: string | null;
};

/** Company inputs; `prefix` namespaces the field names inside combined forms. */
export function CompanyFields({
  company,
  prefix = "",
  compact = false,
}: {
  company?: CompanyValues;
  prefix?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name={`${prefix}name`} label="Raison sociale" required defaultValue={company?.name} />
        <TextField name={`${prefix}siret`} label="SIRET" inputMode="numeric" defaultValue={company?.siret} />
      </div>
      <TextField name={`${prefix}addressLine`} label="Adresse" defaultValue={company?.addressLine} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField name={`${prefix}postalCode`} label="Code postal" defaultValue={company?.postalCode} />
        <TextField name={`${prefix}city`} label="Ville" defaultValue={company?.city} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name={`${prefix}billingEmail`}
          label="Email de facturation"
          type="email"
          defaultValue={company?.billingEmail}
        />
        {compact ? null : (
          <TextField
            name={`${prefix}hubspotCompanyId`}
            label="Identifiant HubSpot"
            defaultValue={company?.hubspotCompanyId}
            hint="Optionnel, pour la future synchronisation."
          />
        )}
      </div>
    </div>
  );
}

export type ContactValues = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
};

export function ContactFields({ contact, prefix = "" }: { contact?: ContactValues; prefix?: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name={`${prefix}firstName`} label="Prénom" required defaultValue={contact?.firstName} />
        <TextField name={`${prefix}lastName`} label="Nom" required defaultValue={contact?.lastName} />
      </div>
      <TextField name={`${prefix}email`} label="Email" type="email" required defaultValue={contact?.email} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name={`${prefix}jobTitle`} label="Fonction" defaultValue={contact?.jobTitle} />
        <TextField name={`${prefix}phone`} label="Téléphone" type="tel" defaultValue={contact?.phone} />
      </div>
    </div>
  );
}
