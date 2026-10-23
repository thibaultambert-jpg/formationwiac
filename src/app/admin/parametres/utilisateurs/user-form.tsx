"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CheckboxField, SelectField, TextField } from "@/components/forms/fields";
import { ROLE_LABELS, ROLES, type Role } from "@/server/auth/policy";
import { updateUser } from "./actions";

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export function UserForm({ user }: { user: { id: string; role: Role; active: boolean; department: string | null } }) {
  return (
    <ActionForm action={updateUser} className="grid gap-3 space-y-0 sm:grid-cols-[10rem_10rem_auto_auto] sm:items-end">
      <input type="hidden" name="id" value={user.id} />
      <SelectField name="role" label="Rôle" defaultValue={user.role} options={ROLE_OPTIONS} />
      <TextField name="department" label="Service" defaultValue={user.department} />
      <CheckboxField name="active" label="Actif" defaultChecked={user.active} className="pb-2" />
      <SubmitButton variant="outline">Enregistrer</SubmitButton>
    </ActionForm>
  );
}
