"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { importReport, nothingToImport, readCsvUpload } from "@/server/csv-upload";
import { parseCompanyImport } from "@/server/domain/csv-import";
import { errorState, formValues, isConfirmed, text, zodFieldErrors, type ActionState } from "@/server/forms";
import {
  createCompany,
  createExternalParticipant,
  findCompanyByName,
  findCompanyBySiret,
  findParticipantByEmail,
  mergeCompanies,
  parseCompany,
  parseParticipant,
} from "@/server/services/companies";

export async function createCompanyAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = parseCompany(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  if (parsed.data.siret) {
    const existing = await findCompanyBySiret(db, parsed.data.siret);
    if (existing) {
      return errorState(formData, `Une entreprise avec ce SIRET existe déjà : ${existing.name}.`, {
        siret: "Déjà utilisé.",
      });
    }
  }
  if (!isConfirmed(formData)) {
    const sameName = await findCompanyByName(db, parsed.data.name);
    if (sameName) {
      return {
        status: "warning",
        warnings: [`Une entreprise nommée « ${sameName.name} » existe déjà. S'agit-il bien d'une autre entreprise ?`],
        values: formValues(formData),
      };
    }
  }

  const company = await createCompany(db, parsed.data, actor.id);
  redirect(`/admin/entreprises/${company.id}?cree=1`);
}

export async function updateCompanyAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const existing = id ? await db.company.findUnique({ where: { id } }) : null;
  if (!existing) return errorState(formData, "Entreprise introuvable.");

  const parsed = parseCompany(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));
  if (parsed.data.siret && parsed.data.siret !== existing.siret) {
    const other = await findCompanyBySiret(db, parsed.data.siret);
    if (other && other.id !== existing.id) {
      return errorState(formData, `Ce SIRET est déjà utilisé par ${other.name}.`, { siret: "Déjà utilisé." });
    }
  }

  const mainContactId = text(formData, "mainContactId");
  const update = { ...parsed.data, mainContactId };
  await db.company.update({ where: { id: existing.id }, data: update });
  const changes = diff(existing, update);
  if (changes)
    await audit(db, { userId: actor.id, action: "update", entity: "company", entityId: existing.id, ...changes });

  refresh();
  return { status: "success", message: "Entreprise enregistrée." };
}

export async function saveContactAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const companyId = text(formData, "companyId");
  const participantId = text(formData, "participantId");
  const company = companyId ? await db.company.findUnique({ where: { id: companyId } }) : null;
  if (!company) return errorState(formData, "Entreprise introuvable.");

  const parsed = parseParticipant(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  const sameEmail = await findParticipantByEmail(db, parsed.data.email);
  if (sameEmail && sameEmail.id !== participantId) {
    const where = sameEmail.company ? ` (${sameEmail.company.name})` : "";
    return errorState(
      formData,
      `L'email ${parsed.data.email} est déjà utilisé par ${sameEmail.firstName} ${sameEmail.lastName}${where}.`,
      { email: "Déjà utilisé." },
    );
  }

  if (participantId) {
    const existing = await db.participant.findUnique({ where: { id: participantId } });
    if (!existing || existing.companyId !== company.id) return errorState(formData, "Contact introuvable.");
    await db.participant.update({ where: { id: existing.id }, data: parsed.data });
    const changes = diff(existing, parsed.data);
    if (changes)
      await audit(db, { userId: actor.id, action: "update", entity: "participant", entityId: existing.id, ...changes });
  } else {
    await createExternalParticipant(db, parsed.data, company.id, actor.id);
  }

  refresh();
  return { status: "success", message: participantId ? "Contact enregistré." : "Contact ajouté." };
}

/** Contacts with a training history are archived, never deleted (rule 9). */
export async function toggleContactArchive(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "participantId");
  const participant = id ? await db.participant.findUnique({ where: { id } }) : null;
  if (!participant || participant.type !== "external") return;

  const archivedAt = participant.archivedAt ? null : new Date();
  await db.participant.update({ where: { id: participant.id }, data: { archivedAt } });
  await audit(db, {
    userId: actor.id,
    action: archivedAt ? "archive" : "restore",
    entity: "participant",
    entityId: participant.id,
  });
  refresh();
}

export async function toggleCompanyArchive(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const company = id ? await db.company.findUnique({ where: { id } }) : null;
  if (!company || company.mergedIntoId) return;

  const archivedAt = company.archivedAt ? null : new Date();
  await db.company.update({ where: { id: company.id }, data: { archivedAt } });
  await audit(db, {
    userId: actor.id,
    action: archivedAt ? "archive" : "restore",
    entity: "company",
    entityId: company.id,
  });
  refresh();
}

export async function mergeCompanyAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const targetId = text(formData, "targetId");
  const duplicateId = text(formData, "duplicateId");
  if (!targetId || !duplicateId)
    return errorState(formData, "Sélectionnez l'entreprise en doublon.", { duplicateId: "Obligatoire." });
  if (targetId === duplicateId)
    return errorState(formData, "Une entreprise ne peut pas être fusionnée avec elle-même.");

  const duplicate = await db.company.findUnique({ where: { id: duplicateId } });
  if (!duplicate || duplicate.mergedIntoId) return errorState(formData, "Entreprise en doublon introuvable.");

  const result = await mergeCompanies(targetId, duplicateId, actor.id);
  refresh();
  return {
    status: "success",
    message: `« ${duplicate.name} » a été fusionnée : ${result.participants} contact(s) et ${result.enrollments} inscription(s) rattachés.`,
  };
}

/** CSV import of companies: existing ones (same SIRET, or same name without SIRET) are left as they are. */
export async function importCompaniesCsv(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const upload = await readCsvUpload(formData);
  if (!upload.ok) return upload.state;
  const { rows, errors } = parseCompanyImport(upload.rows);
  if (rows.length === 0) return nothingToImport(formData, errors);

  let created = 0;
  let existing = 0;
  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        const input = {
          name: row.name,
          siret: row.siret,
          addressLine: row.addressLine,
          postalCode: row.postalCode,
          city: row.city,
          billingEmail: row.billingEmail,
          hubspotCompanyId: null,
        };
        const found = input.siret ? await findCompanyBySiret(tx, input.siret) : await findCompanyByName(tx, input.name);
        if (found) {
          existing++;
          continue;
        }
        await createCompany(tx, input, actor.id);
        created++;
      }
      await audit(tx, {
        userId: actor.id,
        action: "import",
        entity: "company",
        entityId: "list",
        after: { file: upload.name, created, existing, errors: errors.length },
      });
    },
    { timeout: 60_000 },
  );

  refresh();
  const message = importReport(
    [`${created} entreprise(s) créée(s)`, existing > 0 && `${existing} déjà existante(s), non modifiée(s)`],
    errors,
  );
  return { status: "success", message };
}
