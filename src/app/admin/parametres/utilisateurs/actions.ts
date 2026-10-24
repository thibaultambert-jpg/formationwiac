"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { parisDateTimeToUtc } from "@/lib/dates";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { checkUserAdministration, ROLES } from "@/server/auth/policy";
import { errorState, text, type ActionState } from "@/server/forms";

const roleSchema = z.enum(ROLES);

export async function updateUser(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const role = roleSchema.safeParse(text(formData, "role"));
  const active = formData.get("active") === "on";
  const department = text(formData, "department");
  const leftAtInput = text(formData, "leftAt");
  const leftAt = leftAtInput ? parisDateTimeToUtc(leftAtInput, "00:00") : null;
  if (!id || !role.success) return errorState(formData, "Rôle invalide.");
  if (leftAtInput && !leftAt) return errorState(formData, "Date invalide.", { leftAt: "Date invalide." });

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return errorState(formData, "Utilisateur introuvable.");

  const changesAccess = role.data !== target.role || active !== target.active;
  if (changesAccess) {
    const check = checkUserAdministration(actor.id, target, { role: role.data, active }, getEnv().INITIAL_ADMIN_EMAIL);
    if (!check.ok) return errorState(formData, check.reason);
  }

  await db.user.update({ where: { id }, data: { role: role.data, active, department, leftAt } });
  if (role.data !== target.role) {
    await audit(db, {
      userId: actor.id,
      action: "role_change",
      entity: "user",
      entityId: id,
      before: { role: target.role },
      after: { role: role.data },
    });
  }
  const leftChanged = (leftAt?.getTime() ?? null) !== (target.leftAt?.getTime() ?? null);
  if (active !== target.active || department !== target.department || leftChanged) {
    await audit(db, {
      userId: actor.id,
      action: "update",
      entity: "user",
      entityId: id,
      before: { active: target.active, department: target.department, leftAt: target.leftAt },
      after: { active, department, leftAt },
    });
  }

  refresh();
  return { status: "success", message: "Utilisateur enregistré." };
}
