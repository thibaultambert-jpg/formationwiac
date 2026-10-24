"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, SelectField, TextField } from "@/components/forms/fields";
import { toParisDateInput } from "@/lib/dates";
import { ROLE_LABELS, ROLES, type Role } from "@/server/auth/policy";
import { updateUser } from "./actions";

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

type EditableUser = { id: string; role: Role; active: boolean; department: string | null; leftAt: Date | null };

export function UserForm({ user }: { user: EditableUser }) {
  return (
    <ActionForm
      action={updateUser}
      className="grid gap-3 space-y-0 sm:grid-cols-[10rem_10rem_10rem_auto_auto] sm:items-end"
    >
      <input type="hidden" name="id" value={user.id} />
      <SelectField name="role" label="Rôle" defaultValue={user.role} options={ROLE_OPTIONS} />
      <TextField name="department" label="Service" defaultValue={user.department} />
      <TextField
        name="leftAt"
        label="Date de départ"
        type="date"
        defaultValue={user.leftAt ? toParisDateInput(user.leftAt) : null}
      />
      <CheckboxField name="active" label="Actif" defaultChecked={user.active} className="pb-2" />
      <SubmitButton variant="outline">Enregistrer</SubmitButton>
    </ActionForm>
  );
}
