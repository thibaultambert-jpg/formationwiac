import "server-only";
import { after } from "next/server";
import type { DocumentType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatSlot, formatWeekday } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import { buildIcs } from "@/server/email/ics";
import { sendEmail } from "@/server/email/send";
import { renderTemplate, type TemplateVariables } from "@/server/email/template";
import { EMPTY_LEGAL, privacyNoticeText } from "@/server/domain/legal";

export type EnrollmentNotice = "confirmation" | "waitlist" | "promotion";

const NOTICE_TEMPLATES: Record<EnrollmentNotice, DocumentType> = {
  confirmation: "enrollment_confirmation",
  waitlist: "waitlist_notice",
  promotion: "waitlist_promotion",
};

async function loadTemplate(key: DocumentType): Promise<{ subject: string; body: string }> {
  const stored = await db.emailTemplate.findUnique({ where: { key } });
  if (stored) return stored;
  const fallback = DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === key);
  if (!fallback) throw new Error(`No email template for ${key}`);
  return fallback;
}

type SessionForEmail = {
  reference: string;
  location: string | null;
  videoLink: string | null;
  accessInfo?: string | null;
  training: { title: string; thingsToBring?: string | null };
  slots: { id: string; startsAt: Date; endsAt: Date }[];
};

function slotLines(session: SessionForEmail): string {
  return session.slots
    .map((slot) => `- ${formatWeekday(slot.startsAt)} ${formatSlot(slot.startsAt, slot.endsAt)}`)
    .join("\n");
}

export async function sessionVariables(session: SessionForEmail): Promise<TemplateVariables> {
  const organization = await db.organizationSettings.findUnique({ where: { id: 1 } });
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const referent = [
    organization?.disabilityReferentName,
    organization?.disabilityReferentEmail,
    organization?.disabilityReferentPhone,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    formation: session.training.title,
    reference: session.reference,
    dates: slotLines(session),
    lieu: session.location ?? "—",
    lien_visio: session.videoLink ?? "—",
    acces: session.accessInfo ?? "—",
    a_prevoir: session.training.thingsToBring ?? "—",
    organisme: organization?.name ?? "",
    lien_espace: `${appUrl}/mes-formations`,
    lien_reglement: `${appUrl}/reglement-interieur`,
    mention_rgpd: privacyNoticeText(organization ?? { ...EMPTY_LEGAL, name: "" }),
    referent_handicap: referent || "—",
    referent_pedagogique: organization?.pedagogicalContact ?? "—",
    referent_administratif: organization?.administrativeContact ?? organization?.contactEmail ?? "—",
  };
}

export function sessionIcs(session: SessionForEmail, method: "PUBLISH" | "CANCEL" = "PUBLISH"): string {
  return buildIcs(
    session.slots.map((slot) => ({
      uid: `${slot.id}@formations`,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      summary: session.training.title,
      location: session.location,
      description: [session.reference, session.videoLink ? `Lien visio : ${session.videoLink}` : null]
        .filter(Boolean)
        .join("\n"),
      url: session.videoLink,
    })),
    { method },
  );
}

const sessionInclude = {
  training: { select: { title: true } },
  slots: { orderBy: { startsAt: "asc" as const }, select: { id: true, startsAt: true, endsAt: true } },
};

/** Confirmation (+ .ics), waitlist notice or promotion email for one enrollment. */
export async function notifyEnrollment(enrollmentId: string, notice: EnrollmentNotice): Promise<void> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { participant: true, session: { include: sessionInclude } },
  });
  if (!enrollment || enrollment.participant.anonymizedAt) return;
  // Pending its training agreement: the trainee is notified once it is confirmed.
  if (enrollment.status === "pending_agreement") return;

  const template = await loadTemplate(NOTICE_TEMPLATES[notice]);
  const variables = {
    ...(await sessionVariables(enrollment.session)),
    prenom: enrollment.participant.firstName,
    nom: enrollment.participant.lastName,
  };
  const withCalendar = notice !== "waitlist";
  await sendEmail({
    type: NOTICE_TEMPLATES[notice],
    to: enrollment.participant.email,
    subject: renderTemplate(template.subject, variables),
    text: renderTemplate(template.body, variables),
    attachments: withCalendar
      ? [
          {
            filename: `${enrollment.session.reference}.ics`,
            contentType: "text/calendar; charset=UTF-8; method=PUBLISH",
            content: sessionIcs(enrollment.session),
          },
        ]
      : [],
    sessionId: enrollment.sessionId,
    enrollmentId: enrollment.id,
  });
}

/** Cancellation email to every active enrollment and to the trainers (section 6). */
export async function notifySessionCancellation(sessionId: string): Promise<void> {
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      ...sessionInclude,
      enrollments: {
        where: { status: { in: ["confirmed", "pending_agreement", "waitlisted"] } },
        include: { participant: true },
      },
      trainers: { include: { trainer: true } },
    },
  });
  if (!session) return;
  const template = await loadTemplate("session_cancellation");
  const common = { ...(await sessionVariables(session)), motif: session.cancellationReason ?? "—" };
  const ics = sessionIcs(session, "CANCEL");

  const recipients = [
    ...session.enrollments
      .filter((enrollment) => !enrollment.participant.anonymizedAt)
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        email: enrollment.participant.email,
        firstName: enrollment.participant.firstName,
        lastName: enrollment.participant.lastName,
        calendar: enrollment.status === "confirmed",
      })),
    ...session.trainers.map(({ trainer }) => ({
      enrollmentId: null,
      email: trainer.email,
      firstName: trainer.firstName,
      lastName: trainer.lastName,
      calendar: true,
    })),
  ];
  for (const recipient of recipients) {
    const variables = { ...common, prenom: recipient.firstName, nom: recipient.lastName };
    await sendEmail({
      type: "session_cancellation",
      to: recipient.email,
      subject: renderTemplate(template.subject, variables),
      text: renderTemplate(template.body, variables),
      attachments: recipient.calendar
        ? [
            {
              filename: `${session.reference}-annulation.ics`,
              contentType: "text/calendar; charset=UTF-8; method=CANCEL",
              content: ics,
            },
          ]
        : [],
      sessionId: session.id,
      enrollmentId: recipient.enrollmentId,
    });
  }
}

/** Sends the notices after the response, once the transaction is committed. */
export function scheduleEnrollmentNotices(notices: { enrollmentId: string; notice: EnrollmentNotice }[]): void {
  if (notices.length === 0) return;
  after(async () => {
    for (const { enrollmentId, notice } of notices) {
      try {
        await notifyEnrollment(enrollmentId, notice);
        if (notice !== "waitlist") {
          // Dynamic import: the prior information module imports this one.
          const { sendPreInformationAfterEnrollment } = await import("@/server/services/pre-information");
          await sendPreInformationAfterEnrollment(enrollmentId);
        }
      } catch (error) {
        console.error("Enrollment notice failed", enrollmentId, error);
      }
    }
  });
}

export function noticeForStatus(status: string): EnrollmentNotice {
  return status === "waitlisted" ? "waitlist" : "confirmation";
}

export function promotionNotices(enrollmentIds: string[]) {
  return enrollmentIds.map((enrollmentId) => ({ enrollmentId, notice: "promotion" as const }));
}
