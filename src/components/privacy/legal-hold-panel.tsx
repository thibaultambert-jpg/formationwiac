"use client";

import { ShieldAlert } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextareaField } from "@/components/forms/fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/dates";
import type { ActionState } from "@/server/forms";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  kind: "session" | "participant";
  id: string;
  hold: { reason: string | null; at: Date | null };
};

/** Legal hold of a session or a participant (E5): blocks every retention purge while it lasts. */
export function LegalHoldPanel({ action, kind, id, hold }: Props) {
  return (
    <section aria-labelledby={`hold-${id}`} className="space-y-3">
      <h2 id={`hold-${id}`} className="text-lg font-semibold">
        Conservation légale
      </h2>
      {hold.at ? (
        <>
          <Alert variant="warning">
            <ShieldAlert aria-hidden="true" />
            <AlertDescription>
              Sous conservation légale depuis le {formatDate(hold.at)} : {hold.reason}. Aucune anonymisation ni purge
              automatique ne s&apos;applique.
            </AlertDescription>
          </Alert>
          <ActionForm action={action}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="release" value="1" />
            <SubmitButton variant="outline">Lever la conservation légale</SubmitButton>
          </ActionForm>
        </>
      ) : (
        <ActionForm action={action} className="max-w-xl">
          <p className="text-muted-foreground text-sm">
            En cas de contrôle d&apos;un financeur ou de litige, la conservation légale suspend l&apos;anonymisation et
            la suppression des preuves.
          </p>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <TextareaField name="reason" label="Motif" required rows={2} />
          <SubmitButton variant="outline">Placer sous conservation légale</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
