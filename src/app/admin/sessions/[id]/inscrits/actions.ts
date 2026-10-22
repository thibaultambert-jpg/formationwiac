"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { parseCsv } from "@/server/domain/csv";
import { parseFrenchDecimal } from "@/server/domain/numbers";
import { parseImportRows } from "@/server/domain/participant-import";
import { checkbox, errorState, formValues, isConfirmed, text, zodFieldErrors, type ActionState } from "@/server/forms";
import {
  createCompany,
  createExternalParticipant,
  ensureInternalParticipant,
  findCompanyByName,
  findCompanyBySiret,
  findParticipantByEmail,
  parseCompany,
  parseParticipant,
} from "@/server/services/companies";
import {
  EnrollmentError,
  enrollParticipant,
  moveEnrollment,
  overlappingEnrollments,
  updateEnrollment,
} from "@/server/services/enrollments";
import { noticeForStatus, promotionNotices, scheduleEnrollmentNotices } from "@/server/email/notifications";
import { MAX_UPLOAD_BYTES, readUpload } from "@/server/storage";

/** BO additions notify the participant unless "Ne pas envoyer d'email" is checked. */
function notifyNew(formData: FormData, enrollments: { id: string; status: string }[]) {
  if (checkbox(formData, "silent")) return;
  scheduleEnrollmentNotices(
    enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, notice: noticeForStatus(enrollment.status) })),
  );
}

function enrolledMessage(name: string, status: string): string {
  return status === "waitlisted"
    ? `${name} a été placé(e) en liste d'attente : la session est complète.`
    : `${name} est inscrit(e).`;
}

function overlapWarnings(name: string, overlaps: string[]): string[] {
  return overlaps.map((session) => `${name} est déjà inscrit(e) à une session qui chevauche : ${session}.`);
}

async function loadSession(sessionId: string | null) {
  return sessionId ? db.trainingSession.findUnique({ where: { id: sessionId } }) : null;
}

export async function addInternalEnrollment(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(text(formData, "sessionId"));
  if (!session) return errorState(formData, "Session introuvable.");
  const userId = text(formData, "userId");
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user || !user.active) return errorState(formData, "Sélectionnez un collaborateur.", { userId: "Obligatoire." });
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  if (!isConfirmed(formData)) {
    const warnings: string[] = [];
    if (!session.openToInternal) warnings.push("Cette session n'est pas ouverte aux collaborateurs sur le front.");
    const participant = await db.participant.findUnique({ where: { userId: user.id } });
    if (participant) warnings.push(...overlapWarnings(name, await overlappingEnrollments(participant.id, session.id)));
    if (warnings.length > 0) return { status: "warning", warnings, values: formValues(formData) };
  }

  try {
    const enrollment = await db.$transaction(async (tx) => {
      const participant = await ensureInternalParticipant(tx, user.id, actor.id);
      return enrollParticipant(tx, {
        sessionId: session.id,
        participantId: participant.id,
        source: "back_office",
        actorId: actor.id,
        motivation: text(formData, "motivation"),
      });
    });
    notifyNew(formData, [enrollment]);
    refresh();
    return { status: "success", message: enrolledMessage(name, enrollment.status) };
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }
}

/**
 * Adds an external participant: existing or new company, existing or new
 * contact, all from the session page (lot 2 acceptance criterion).
 */
export async function addExternalEnrollment(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(text(formData, "sessionId"));
  if (!session) return errorState(formData, "Session introuvable.");
  if (!session.openToExternal) {
    return errorState(
      formData,
      "Cette session n'est pas ouverte aux participants externes (modifiez la session pour l'ouvrir).",
    );
  }

  const companyMode = text(formData, "companyMode");
  const contactMode = text(formData, "contactMode");

  // Company: existing or new.
  let companyId: string | null = null;
  let newCompany: ReturnType<typeof parseCompany> | null = null;
  if (companyMode === "existing") {
    companyId = text(formData, "companyId");
    const company = companyId ? await db.company.findUnique({ where: { id: companyId } }) : null;
    if (!company || company.mergedIntoId)
      return errorState(formData, "Sélectionnez une entreprise.", { companyId: "Obligatoire." });
  } else {
    newCompany = parseCompany(formData, "company.");
    if (!newCompany.success) {
      return errorState(
        formData,
        "Les informations de l'entreprise sont invalides.",
        zodFieldErrors(newCompany.error.issues.map((issue) => ({ ...issue, path: ["company", ...issue.path] }))),
      );
    }
    if (newCompany.data.siret) {
      const existing = await findCompanyBySiret(db, newCompany.data.siret);
      if (existing) {
        return errorState(
          formData,
          `Une entreprise avec ce SIRET existe déjà : ${existing.name}. Sélectionnez-la dans la recherche.`,
          {
            "company.siret": "Déjà utilisé.",
          },
        );
      }
    }
  }

  // Contact: existing or new.
  let participantId: string | null = null;
  let newContact: ReturnType<typeof parseParticipant> | null = null;
  if (contactMode === "existing") {
    participantId = text(formData, "participantId");
    const participant = participantId ? await db.participant.findUnique({ where: { id: participantId } }) : null;
    if (!participant || participant.type !== "external") {
      return errorState(formData, "Sélectionnez un contact.", { participantId: "Obligatoire." });
    }
  } else {
    newContact = parseParticipant(formData, "contact.");
    if (!newContact.success) {
      return errorState(
        formData,
        "Les informations du participant sont invalides.",
        zodFieldErrors(newContact.error.issues.map((issue) => ({ ...issue, path: ["contact", ...issue.path] }))),
      );
    }
    const sameEmail = await findParticipantByEmail(db, newContact.data.email);
    if (sameEmail) {
      const where = sameEmail.company ? ` (${sameEmail.company.name})` : "";
      return errorState(
        formData,
        `${sameEmail.firstName} ${sameEmail.lastName}${where} existe déjà avec cet email : sélectionnez ce contact dans la recherche.`,
        { "contact.email": "Déjà utilisé." },
      );
    }
  }

  if (!isConfirmed(formData)) {
    const warnings: string[] = [];
    if (newCompany?.success) {
      const sameName = await findCompanyByName(db, newCompany.data.name);
      if (sameName)
        warnings.push(
          `Une entreprise nommée « ${sameName.name} » existe déjà. Voulez-vous vraiment en créer une nouvelle ?`,
        );
    }
    if (participantId) {
      const participant = await db.participant.findUniqueOrThrow({ where: { id: participantId } });
      warnings.push(
        ...overlapWarnings(
          `${participant.firstName} ${participant.lastName}`,
          await overlappingEnrollments(participantId, session.id),
        ),
      );
    }
    if (warnings.length > 0) return { status: "warning", warnings, values: formValues(formData) };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const company = newCompany?.success
        ? await createCompany(tx, newCompany.data, actor.id)
        : await tx.company.findUniqueOrThrow({ where: { id: companyId! } });
      const participant = newContact?.success
        ? await createExternalParticipant(tx, newContact.data, company.id, actor.id)
        : await tx.participant.findUniqueOrThrow({ where: { id: participantId! } });
      const enrollment = await enrollParticipant(tx, {
        sessionId: session.id,
        participantId: participant.id,
        source: "back_office",
        actorId: actor.id,
      });
      // Billing goes to the company chosen in the dialog.
      if (enrollment.billingCompanyId !== company.id) {
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { billingCompanyId: company.id } });
      }
      return { company, participant, enrollment };
    });
    notifyNew(formData, [result.enrollment]);
    refresh();
    return {
      status: "success",
      message: enrolledMessage(
        `${result.participant.firstName} ${result.participant.lastName}`,
        result.enrollment.status,
      ),
      data: {
        companyId: result.company.id,
        companyName: result.company.name,
        companyDescription: result.company.siret ? `SIRET ${result.company.siret}` : "",
      },
    };
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }
}

export type ImportReport = {
  confirmed: number;
  waitlisted: number;
  alreadyEnrolled: number;
  createdCompanies: number;
  createdContacts: number;
  errors: { line: number; message: string }[];
};

/** Imports external participants from a CSV file and enrolls them. */
export async function importExternalCsv(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(text(formData, "sessionId"));
  if (!session) return errorState(formData, "Session introuvable.");
  if (!session.openToExternal)
    return errorState(formData, "Cette session n'est pas ouverte aux participants externes.");

  const file = readUpload(formData.get("file"));
  if (!file) return errorState(formData, "Sélectionnez un fichier CSV.", { file: "Obligatoire." });
  if (file.size > MAX_UPLOAD_BYTES) return errorState(formData, "Le fichier dépasse 4 Mo.");

  const { rows, errors } = parseImportRows(parseCsv(await file.text()));
  if (rows.length === 0) {
    return errorState(
      formData,
      errors.map((error) => `Ligne ${error.line} : ${error.message}`).join(" ") || "Aucune ligne à importer.",
    );
  }

  const created: { id: string; status: string }[] = [];
  const report: ImportReport = {
    confirmed: 0,
    waitlisted: 0,
    alreadyEnrolled: 0,
    createdCompanies: 0,
    createdContacts: 0,
    errors: [...errors],
  };
  try {
    await db.$transaction(
      async (tx) => {
        const companyCache = new Map<string, string>();
        for (const row of rows) {
          let participant = await findParticipantByEmail(tx, row.email);
          if (participant && participant.type !== "external") {
            report.errors.push({
              line: row.line,
              message: `${row.email} est un compte collaborateur : ajoutez-le comme collaborateur.`,
            });
            continue;
          }
          if (!participant) {
            const cacheKey = row.siret ?? row.companyName.toLowerCase();
            let companyId = companyCache.get(cacheKey) ?? null;
            if (!companyId) {
              const company =
                (row.siret ? await findCompanyBySiret(tx, row.siret) : null) ??
                (await findCompanyByName(tx, row.companyName));
              if (company) {
                companyId = company.id;
              } else {
                const created = await createCompany(
                  tx,
                  {
                    name: row.companyName,
                    siret: row.siret,
                    addressLine: null,
                    postalCode: null,
                    city: null,
                    billingEmail: null,
                    hubspotCompanyId: null,
                  },
                  actor.id,
                );
                companyId = created.id;
                report.createdCompanies++;
              }
              companyCache.set(cacheKey, companyId);
            }
            const created = await createExternalParticipant(
              tx,
              {
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email,
                jobTitle: row.jobTitle,
                phone: row.phone,
              },
              companyId,
              actor.id,
            );
            participant = { ...created, company: null };
            report.createdContacts++;
          }

          const existing = await tx.enrollment.findUnique({
            where: { sessionId_participantId: { sessionId: session.id, participantId: participant.id } },
          });
          if (existing && existing.status !== "cancelled") {
            report.alreadyEnrolled++;
            continue;
          }
          const enrollment = await enrollParticipant(tx, {
            sessionId: session.id,
            participantId: participant.id,
            source: "back_office",
            actorId: actor.id,
          });
          created.push(enrollment);
          if (enrollment.status === "waitlisted") report.waitlisted++;
          else report.confirmed++;
        }
        await audit(tx, {
          userId: actor.id,
          action: "import",
          entity: "session",
          entityId: session.id,
          after: { file: file.name, ...report, errors: report.errors.length },
        });
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }

  notifyNew(formData, created);
  refresh();
  const parts = [
    `${report.confirmed} inscrit(s)`,
    report.waitlisted ? `${report.waitlisted} en liste d'attente` : null,
    report.alreadyEnrolled ? `${report.alreadyEnrolled} déjà inscrit(s)` : null,
    report.createdCompanies ? `${report.createdCompanies} entreprise(s) créée(s)` : null,
    report.createdContacts ? `${report.createdContacts} contact(s) créé(s)` : null,
  ].filter(Boolean);
  const errorText = report.errors.length
    ? ` Lignes ignorées : ${report.errors.map((error) => `ligne ${error.line} (${error.message})`).join(" ; ")}.`
    : "";
  return { status: "success", message: `Import terminé : ${parts.join(", ")}.${errorText}` };
}

const updateSchema = z.object({
  enrollmentId: z.uuid(),
  status: z.enum(["confirmed", "waitlisted", "cancelled", "present", "absent"]),
  appliedPrice: z.number({ error: "Prix invalide." }).min(0, "Prix invalide.").nullable(),
  billingCompanyId: z.uuid().nullable(),
  cancellationReason: z.string().nullable(),
});

export async function updateEnrollmentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = updateSchema.safeParse({
    enrollmentId: text(formData, "enrollmentId"),
    status: text(formData, "status"),
    appliedPrice: parseFrenchDecimal(text(formData, "appliedPrice")),
    billingCompanyId: text(formData, "billingCompanyId"),
    cancellationReason: text(formData, "cancellationReason"),
  });
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  try {
    const { promoted } = await updateEnrollment(parsed.data.enrollmentId, parsed.data, actor.id);
    scheduleEnrollmentNotices(promotionNotices(promoted));
    refresh();
    return {
      status: "success",
      message:
        promoted.length > 0
          ? `Inscription mise à jour. ${promoted.length} personne(s) sortie(s) de la liste d'attente.`
          : "Inscription mise à jour.",
    };
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }
}

export async function moveEnrollmentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const enrollmentId = text(formData, "enrollmentId");
  const targetSessionId = text(formData, "targetSessionId");
  if (!enrollmentId || !targetSessionId)
    return errorState(formData, "Choisissez la session de destination.", { targetSessionId: "Obligatoire." });

  if (!isConfirmed(formData)) {
    const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId }, include: { participant: true } });
    if (enrollment) {
      const overlaps = (await overlappingEnrollments(enrollment.participantId, targetSessionId)).filter(Boolean);
      const own = await db.trainingSession.findUnique({
        where: { id: enrollment.sessionId },
        select: { reference: true },
      });
      const others = overlaps.filter((label) => !own || !label.includes(own.reference));
      if (others.length > 0) {
        return {
          status: "warning",
          warnings: overlapWarnings(`${enrollment.participant.firstName} ${enrollment.participant.lastName}`, others),
          values: formValues(formData),
        };
      }
    }
  }

  try {
    const result = await moveEnrollment(enrollmentId, targetSessionId, actor.id);
    scheduleEnrollmentNotices(promotionNotices(result.promoted));
    refresh();
    return {
      status: "success",
      message: `Inscription déplacée vers ${result.target.reference}${result.status === "waitlisted" ? " (liste d'attente)" : ""}.`,
    };
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }
}
