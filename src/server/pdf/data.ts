import "server-only";
import { db } from "@/lib/db";
import { readStoredFile } from "@/server/storage";

export type ImageData = { data: Buffer; format: "png" | "jpg" };

async function image(path: string | null | undefined): Promise<ImageData | null> {
  if (!path) return null;
  const file = await readStoredFile(path);
  if (!file) return null;
  return { data: file.body, format: file.contentType === "image/jpeg" ? "jpg" : "png" };
}

export type Organization = {
  name: string;
  address: string;
  siret: string | null;
  activityDeclarationNumber: string | null;
  contactEmail: string | null;
  managerName: string | null;
  managerTitle: string | null;
  city: string | null;
  logo: ImageData | null;
  managerSignature: ImageData | null;
};

export async function loadOrganization(): Promise<Organization> {
  const settings = await db.organizationSettings.findUnique({ where: { id: 1 } });
  return {
    name: settings?.name ?? "Organisme de formation",
    address: [settings?.addressLine, [settings?.postalCode, settings?.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    siret: settings?.siret ?? null,
    activityDeclarationNumber: settings?.activityDeclarationNumber ?? null,
    contactEmail: settings?.contactEmail ?? null,
    managerName: settings?.managerName ?? null,
    managerTitle: settings?.managerTitle ?? null,
    city: settings?.city ?? null,
    logo: await image(settings?.logoPath),
    managerSignature: await image(settings?.managerSignaturePath),
  };
}

/** Everything the session documents need, with signature images loaded. */
export async function loadSessionDocuments(sessionId: string) {
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      training: true,
      slots: { orderBy: { startsAt: "asc" }, include: { trainerSignatures: true } },
      trainers: { include: { trainer: true } },
      enrollments: {
        where: { status: { in: ["confirmed", "present", "absent"] } },
        include: { participant: { include: { company: true } }, attendances: true },
      },
    },
  });
  if (!session) return null;

  const signatures = new Map<string, ImageData | null>();
  for (const enrollment of session.enrollments) {
    for (const attendance of enrollment.attendances) {
      if (attendance.present)
        signatures.set(`${enrollment.id}:${attendance.slotId}`, await image(attendance.signaturePath));
    }
  }
  const trainerSignatures = new Map<string, ImageData | null>();
  for (const slot of session.slots) {
    for (const signature of slot.trainerSignatures) {
      trainerSignatures.set(`${signature.trainerId}:${slot.id}`, await image(signature.signaturePath));
    }
  }

  const enrollments = [...session.enrollments].sort((a, b) =>
    `${a.participant.lastName} ${a.participant.firstName}`.localeCompare(
      `${b.participant.lastName} ${b.participant.firstName}`,
      "fr",
    ),
  );
  return {
    session: { ...session, enrollments },
    signatures,
    trainerSignatures,
    organization: await loadOrganization(),
  };
}

export type SessionDocuments = NonNullable<Awaited<ReturnType<typeof loadSessionDocuments>>>;
