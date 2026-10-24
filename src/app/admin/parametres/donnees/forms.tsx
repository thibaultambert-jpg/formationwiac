"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import type { RetentionPolicy } from "@/server/domain/privacy";
import { anonymizeExpired, purgeExpiredProofs, purgeTechnicalNow, saveRetention } from "./actions";

export function RetentionForm({ policy }: { policy: RetentionPolicy }) {
  return (
    <ActionForm action={saveRetention} className="max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="externalYears"
          label="Externes : années après la dernière formation"
          type="number"
          min={1}
          max={30}
          defaultValue={policy.externalYears}
        />
        <TextField
          name="internalYears"
          label="Internes : années après le départ"
          type="number"
          min={1}
          max={30}
          defaultValue={policy.internalYears}
        />
        <TextField
          name="technicalMonths"
          label="Traces techniques (IP, navigateur) : mois"
          type="number"
          min={1}
          max={60}
          defaultValue={policy.technicalMonths}
        />
        <TextField
          name="tokenDays"
          label="Liens expirés : jours après expiration"
          type="number"
          min={1}
          max={365}
          defaultValue={policy.tokenDays}
        />
      </div>
      <SubmitButton>Enregistrer</SubmitButton>
    </ActionForm>
  );
}

export function AnonymizeExpiredForm({ count }: { count: number }) {
  return (
    <ActionForm action={anonymizeExpired}>
      <SubmitButton variant="destructive">{`Anonymiser ${count} participant(s)`}</SubmitButton>
    </ActionForm>
  );
}

export function PurgeProofsForm({ count }: { count: number }) {
  return (
    <ActionForm action={purgeExpiredProofs}>
      <SubmitButton variant="destructive">{`Supprimer ${count} fichier(s)`}</SubmitButton>
    </ActionForm>
  );
}

export function PurgeTechnicalForm() {
  return (
    <ActionForm action={purgeTechnicalNow}>
      <SubmitButton variant="outline">Purger maintenant</SubmitButton>
    </ActionForm>
  );
}
