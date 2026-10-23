"use client";

import { useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, useActionFormState, useFieldError } from "@/components/forms/action-form";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/forms";

export type SlotRow = { key: string; id: string; date: string; start: string; end: string };

export type SessionFormValues = {
  id: string;
  trainingId: string;
  location: string | null;
  videoLink: string | null;
  capacityMax: number;
  capacityMin: number | null;
  registrationDeadline: string | null;
  openToInternal: boolean;
  openToExternal: boolean;
  internalNotes: string | null;
  trainerIds: string[];
  slots: SlotRow[];
};

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  session?: SessionFormValues;
  defaultTrainingId?: string;
  trainings: { id: string; title: string }[];
  trainers: { id: string; name: string; type: string }[];
};

let keySeed = 0;
const newKey = () => `slot-${++keySeed}`;

function nextDay(date: string): string {
  if (!date) return "";
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

export function SessionForm({ action, session, defaultTrainingId, trainings, trainers }: Props) {
  return (
    <ActionForm action={action} className="max-w-4xl space-y-8">
      {session ? <input type="hidden" name="id" value={session.id} /> : null}

      <section className="space-y-4" aria-labelledby="session-general">
        <h2 id="session-general" className="text-lg font-semibold">
          Formation et lieu
        </h2>
        <SelectField
          name="trainingId"
          label="Formation"
          required
          defaultValue={session?.trainingId ?? defaultTrainingId}
          placeholder="Choisir une formation"
          options={trainings.map((training) => ({ value: training.id, label: training.title }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="location" label="Lieu" defaultValue={session?.location} hint="Adresse ou salle." />
          <TextField
            name="videoLink"
            label="Lien visio"
            type="url"
            defaultValue={session?.videoLink}
            placeholder="https://…"
          />
        </div>
      </section>

      <SlotsEditor initial={session?.slots} />

      <section className="space-y-4" aria-labelledby="session-capacity">
        <h2 id="session-capacity" className="text-lg font-semibold">
          Capacité et inscriptions
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="capacityMax"
            label="Capacité maximale"
            type="number"
            min={1}
            required
            defaultValue={session?.capacityMax ?? 12}
          />
          <TextField
            name="capacityMin"
            label="Capacité minimale"
            type="number"
            min={0}
            defaultValue={session?.capacityMin}
          />
          <TextField
            name="registrationDeadline"
            label="Date limite d'inscription"
            type="date"
            defaultValue={session?.registrationDeadline}
            hint="Inclusive, jusqu'à 23:59."
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          <CheckboxField
            name="openToInternal"
            label="Ouverte aux collaborateurs"
            hint="Visible et ouverte à l'inscription sur le front."
            defaultChecked={session?.openToInternal ?? true}
          />
          <CheckboxField
            name="openToExternal"
            label="Ouverte aux externes"
            hint="Inscription depuis le back-office uniquement."
            defaultChecked={session?.openToExternal ?? false}
          />
        </div>
        <FieldMessage name="openToInternal" />
      </section>

      <TrainersPicker trainers={trainers} initial={session?.trainerIds ?? []} />

      <TextareaField name="internalNotes" label="Notes internes" defaultValue={session?.internalNotes} />

      <SubmitButton>{session ? "Enregistrer la session" : "Créer la session"}</SubmitButton>
    </ActionForm>
  );
}

function FieldMessage({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-destructive text-xs">{error}</p> : null;
}

function SlotsEditor({ initial }: { initial?: SlotRow[] }) {
  const [rows, setRows] = useState<SlotRow[]>(
    initial && initial.length > 0 ? initial : [{ key: newKey(), id: "", date: "", start: "09:00", end: "12:30" }],
  );
  const { state } = useActionFormState();
  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  function update(key: string, patch: Partial<SlotRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addSlot() {
    const last = rows[rows.length - 1];
    setRows([...rows, { key: newKey(), id: "", date: last?.date ?? "", start: "13:30", end: "17:00" }]);
  }

  /** Adds a full day as two half-days, the day after the last slot. */
  function addDay() {
    const last = rows.filter((row) => row.date).at(-1);
    const date = last ? nextDay(last.date) : "";
    setRows([
      ...rows.filter((row) => row.date || row.id),
      { key: newKey(), id: "", date, start: "09:00", end: "12:30" },
      { key: newKey(), id: "", date, start: "13:30", end: "17:00" },
    ]);
  }

  return (
    <section className="space-y-4" aria-labelledby="session-slots">
      <div className="space-y-1">
        <h2 id="session-slots" className="text-lg font-semibold">
          Créneaux
        </h2>
        <p className="text-muted-foreground text-sm">
          Un créneau par demi-journée : il sert de base à l&apos;émargement.
        </p>
      </div>
      {fieldErrors.slots ? <p className="text-destructive text-sm">{fieldErrors.slots}</p> : null}
      <ol className="space-y-3">
        {rows.map((row, index) => {
          const error = fieldErrors[`slots.${index}`];
          return (
            <li key={row.key} className="rounded-md border p-3">
              <input type="hidden" name="slotId" value={row.id} />
              <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr_8rem_8rem_auto]">
                <span className="text-muted-foreground pb-2 text-sm">n° {index + 1}</span>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.key}-date`}>Date</Label>
                  <Input
                    id={`${row.key}-date`}
                    name="slotDate"
                    type="date"
                    required
                    value={row.date}
                    onChange={(event) => update(row.key, { date: event.target.value })}
                    aria-invalid={error ? true : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.key}-start`}>Début</Label>
                  <Input
                    id={`${row.key}-start`}
                    name="slotStart"
                    type="time"
                    required
                    value={row.start}
                    onChange={(event) => update(row.key, { start: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.key}-end`}>Fin</Label>
                  <Input
                    id={`${row.key}-end`}
                    name="slotEnd"
                    type="time"
                    required
                    value={row.end}
                    onChange={(event) => update(row.key, { end: event.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((other) => other.key !== row.key))}
                  aria-label={`Supprimer le créneau n° ${index + 1}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {error ? <p className="text-destructive mt-2 text-xs">{error}</p> : null}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addSlot}>
          <Plus aria-hidden="true" />
          Ajouter un créneau
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addDay}>
          <CalendarPlus aria-hidden="true" />
          Ajouter une journée (2 demi-journées)
        </Button>
      </div>
    </section>
  );
}

function TrainersPicker({ trainers, initial }: { trainers: Props["trainers"]; initial: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold">Formateurs</legend>
      {trainers.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun formateur actif. Créez d&apos;abord une fiche formateur.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {trainers.map((trainer) => (
            <label
              key={trainer.id}
              className="hover:bg-accent flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Checkbox
                name="trainerIds"
                value={trainer.id}
                checked={selected.has(trainer.id)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(trainer.id);
                  else next.delete(trainer.id);
                  setSelected(next);
                }}
              />
              <span>
                {trainer.name}
                <span className="text-muted-foreground block text-xs">{trainer.type}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
