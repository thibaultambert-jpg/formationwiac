"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextareaField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/server/forms";
import { enrollSelf, unenrollSelf } from "../../actions";

type SessionSummary = {
  id: string;
  title: string;
  slots: string[];
  place: string;
  full: boolean;
};

/**
 * Stays mounted after a successful enrollment (the trigger is then hidden) so
 * that the confirmation remains visible after the page refresh.
 */
export function EnrollDialog({ session, showTrigger }: { session: SessionSummary; showTrigger: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDone(null);
      }}
    >
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant={session.full ? "outline" : "default"}>
            {session.full ? "Rejoindre la liste d'attente" : "S'inscrire"}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 aria-hidden="true" className="size-5 text-emerald-700" />
                C&apos;est noté !
              </DialogTitle>
              <DialogDescription>{done}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Terminé</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirmer votre inscription</DialogTitle>
              <DialogDescription>
                {session.full
                  ? "Cette session est complète : vous serez placé(e) en liste d'attente et prévenu(e) si une place se libère."
                  : "Votre inscription sera confirmée immédiatement, sans validation."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{session.title}</p>
              <ul className="space-y-0.5">
                {session.slots.map((slot) => (
                  <li key={slot}>{slot}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">{session.place}</p>
            </div>
            <ActionForm
              action={enrollSelf}
              hideSuccess
              onSuccess={(state: ActionState) => setDone(state.status === "success" ? (state.message ?? "") : null)}
            >
              <input type="hidden" name="sessionId" value={session.id} />
              <TextareaField name="motivation" label="Motivation ou besoin (facultatif)" rows={2} />
              <SubmitButton className="w-full sm:w-auto">
                {session.full ? "Confirmer (liste d'attente)" : "Confirmer l'inscription"}
              </SubmitButton>
            </ActionForm>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UnenrollDialog({ enrollmentId, title }: { enrollmentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Se désinscrire
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Se désinscrire</DialogTitle>
          <DialogDescription>
            Votre place sera proposée à la première personne en liste d&apos;attente pour « {title} ».
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={unenrollSelf} hideSuccess onSuccess={() => setOpen(false)}>
          <input type="hidden" name="enrollmentId" value={enrollmentId} />
          <TextareaField name="reason" label="Motif (facultatif)" rows={2} />
          <SubmitButton variant="destructive">Confirmer la désinscription</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
