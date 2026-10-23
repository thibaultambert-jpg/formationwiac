"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { errorState, text, type ActionState } from "@/server/forms";

export async function createTheme(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);
  const name = text(formData, "name");
  if (!name) return errorState(formData, "Le nom du thème est obligatoire.", { name: "Obligatoire." });

  const duplicate = await db.theme.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (duplicate) return errorState(formData, "Ce thème existe déjà.", { name: "Déjà utilisé." });

  const last = await db.theme.aggregate({ _max: { position: true } });
  const theme = await db.theme.create({ data: { name, position: (last._max.position ?? 0) + 1 } });
  await audit(db, { userId: user.id, action: "create", entity: "theme", entityId: theme.id, after: { name } });

  refresh();
  return { status: "success", message: `Thème « ${name} » ajouté.` };
}

export async function updateTheme(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);
  const id = text(formData, "id");
  const name = text(formData, "name");
  const position = Number(text(formData, "position") ?? "0");
  if (!id || !name) return errorState(formData, "Le nom du thème est obligatoire.");
  if (!Number.isInteger(position)) return errorState(formData, "L'ordre doit être un nombre entier.");

  const theme = await db.theme.findUnique({ where: { id } });
  if (!theme) return errorState(formData, "Thème introuvable.");
  const duplicate = await db.theme.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, NOT: { id } },
  });
  if (duplicate) return errorState(formData, "Un autre thème porte déjà ce nom.");

  await db.theme.update({ where: { id }, data: { name, position } });
  await audit(db, {
    userId: user.id,
    action: "update",
    entity: "theme",
    entityId: id,
    before: { name: theme.name, position: theme.position },
    after: { name, position },
  });

  refresh();
  return { status: "success", message: "Thème enregistré." };
}

/** Themes used by trainings are deactivated instead of being deleted. */
export async function toggleTheme(formData: FormData): Promise<void> {
  const user = await requireRole(["admin"]);
  const id = text(formData, "id");
  if (!id) return;
  const theme = await db.theme.findUnique({ where: { id } });
  if (!theme) return;

  await db.theme.update({ where: { id }, data: { active: !theme.active } });
  await audit(db, {
    userId: user.id,
    action: theme.active ? "archive" : "restore",
    entity: "theme",
    entityId: id,
    before: { active: theme.active },
    after: { active: !theme.active },
  });
  refresh();
}

export async function deleteTheme(formData: FormData): Promise<void> {
  const user = await requireRole(["admin"]);
  const id = text(formData, "id");
  if (!id) return;
  const theme = await db.theme.findUnique({ where: { id }, include: { _count: { select: { trainings: true } } } });
  if (!theme || theme._count.trainings > 0) return;

  await db.theme.delete({ where: { id } });
  await audit(db, { userId: user.id, action: "delete", entity: "theme", entityId: id, before: { name: theme.name } });
  refresh();
}
