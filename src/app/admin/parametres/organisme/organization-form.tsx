"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { FileField, TextField } from "@/components/forms/fields";
import { saveOrganization } from "./actions";

type Organization = {
  name: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  activityDeclarationNumber: string | null;
  managerName: string | null;
  managerTitle: string | null;
  contactEmail: string | null;
  logoPath: string | null;
  managerSignaturePath: string | null;
};

export function OrganizationForm({ organization }: { organization: Organization | null }) {
  return (
    <ActionForm action={saveOrganization} className="max-w-2xl">
      <TextField name="name" label="Nom de l'organisme" required defaultValue={organization?.name} />
      <TextField name="addressLine" label="Adresse" defaultValue={organization?.addressLine} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField name="postalCode" label="Code postal" defaultValue={organization?.postalCode} />
        <TextField name="city" label="Ville" defaultValue={organization?.city} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="siret" label="SIRET" inputMode="numeric" defaultValue={organization?.siret} />
        <TextField
          name="activityDeclarationNumber"
          label="Numéro de déclaration d'activité"
          defaultValue={organization?.activityDeclarationNumber}
        />
      </div>
      <TextField name="contactEmail" label="Email de contact" type="email" defaultValue={organization?.contactEmail} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="managerName" label="Nom du responsable" defaultValue={organization?.managerName} />
        <TextField name="managerTitle" label="Fonction du responsable" defaultValue={organization?.managerTitle} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FileField name="logo" label="Logo" accept="image/png,image/jpeg" hint="PNG ou JPEG, 4 Mo maximum." />
          {organization?.logoPath ? <StoredImage path={organization.logoPath} alt="Logo actuel" /> : null}
        </div>
        <div className="space-y-2">
          <FileField
            name="managerSignature"
            label="Signature du responsable"
            accept="image/png,image/jpeg"
            hint="Imprimée sur les attestations."
          />
          {organization?.managerSignaturePath ? (
            <StoredImage path={organization.managerSignaturePath} alt="Signature actuelle" />
          ) : null}
        </div>
      </div>
      <SubmitButton>Enregistrer</SubmitButton>
    </ActionForm>
  );
}

function StoredImage({ path, alt }: { path: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- authenticated file route, not optimizable
  return <img src={`/fichiers/${path}`} alt={alt} className="h-16 w-auto rounded border bg-white object-contain p-1" />;
}
