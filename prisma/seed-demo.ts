// Demo data for local testing and validation: trainings, trainers, companies,
// contacts and sessions with enrollments. Idempotent (skipped when present).
// Run after the base seed: `pnpm db:seed && pnpm db:seed:demo`.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { TZDate } from "@date-fns/tz";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});

const MARKER = "demo-";

function parisSlot(daysFromNow: number, start: [number, number], end: [number, number]) {
  const base = new Date();
  base.setDate(base.getDate() + daysFromNow);
  const at = ([hours, minutes]: [number, number]) =>
    new Date(
      new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, "Europe/Paris").getTime(),
    );
  return { startsAt: at(start), endsAt: at(end) };
}

function fullDay(daysFromNow: number) {
  return [parisSlot(daysFromNow, [9, 0], [12, 30]), parisSlot(daysFromNow, [13, 30], [17, 0])];
}

async function nextReference(year: number) {
  const rows = await db.$queryRaw<{ max: number | null }[]>`
    SELECT max(split_part(reference, '-', 3)::int) AS max FROM sessions
    WHERE reference LIKE ${`FORM-${year}-%`} AND split_part(reference, '-', 3) ~ '^[0-9]+$'`;
  return `FORM-${year}-${String((rows[0]?.max ?? 0) + 1).padStart(3, "0")}`;
}

async function main() {
  if (await db.training.findFirst({ where: { slug: { startsWith: MARKER } } })) {
    console.log("Demo data already present, nothing to do.");
    return;
  }
  const themes = await db.theme.findMany();
  const theme = (name: string) => themes.find((item) => item.name === name)?.id ?? null;

  const trainings = await Promise.all(
    [
      {
        title: "Manager une équipe au quotidien",
        theme: "Management",
        hours: 14,
        price: 1250,
        modality: "in_person" as const,
      },
      {
        title: "Excel : tableaux croisés dynamiques",
        theme: "Bureautique et outils numériques",
        hours: 7,
        price: 590,
        modality: "remote" as const,
      },
      {
        title: "Prise de parole en public",
        theme: "Efficacité professionnelle",
        hours: 14,
        price: 990,
        modality: "blended" as const,
      },
      {
        title: "Sauveteur secouriste du travail",
        theme: "Sécurité",
        hours: 14,
        price: 450,
        modality: "in_person" as const,
      },
    ].map((item, index) =>
      db.training.create({
        data: {
          title: item.title,
          slug: `${MARKER}${index + 1}`,
          themeId: theme(item.theme),
          objectives:
            "Identifier les leviers clés.\nMettre en pratique sur des cas concrets.\nConstruire son plan d'action.",
          prerequisites: "Aucun.",
          targetAudience: "Tout collaborateur concerné.",
          programText: "Jour 1 : fondamentaux et mises en situation.\nJour 2 : approfondissements et plan d'action.",
          durationHours: item.hours,
          priceExclTax: item.price,
          modality: item.modality,
        },
      }),
    ),
  );

  const trainers = await Promise.all(
    [
      {
        firstName: "Hélène",
        lastName: "Morel",
        company: "Morel Conseil",
        specialties: ["Management", "Communication"],
      },
      { firstName: "Karim", lastName: "Benali", company: "Data Formation", specialties: ["Excel", "Power BI"] },
      { firstName: "Sophie", lastName: "Lambert", company: "Sécurité Plus", specialties: ["SST", "Prévention"] },
    ].map((item) =>
      db.trainer.create({
        data: {
          ...item,
          type: "external",
          email: `${item.firstName.toLowerCase()}.${item.lastName.toLowerCase()}@demo.example`,
        },
      }),
    ),
  );

  const companies = await Promise.all(
    [
      { name: "Boulangeries Martin", siret: "73282932000074", city: "Lyon" },
      { name: "Transports Lefèvre", siret: null, city: "Nantes" },
    ].map((item) => db.company.create({ data: item })),
  );
  const contacts = await Promise.all(
    [
      { companyId: companies[0].id, firstName: "Julie", lastName: "Martin", jobTitle: "Gérante" },
      { companyId: companies[0].id, firstName: "Thomas", lastName: "Roux", jobTitle: "Responsable de production" },
      { companyId: companies[1].id, firstName: "Nadia", lastName: "Lefèvre", jobTitle: "DRH" },
      { companyId: companies[1].id, firstName: "Marc", lastName: "Garnier", jobTitle: "Chef d'équipe" },
    ].map((item) =>
      db.participant.create({
        data: {
          ...item,
          type: "external",
          email: `${item.firstName.toLowerCase()}.${item.lastName.toLowerCase()}@demo.example`,
        },
      }),
    ),
  );
  await db.company.update({ where: { id: companies[0].id }, data: { mainContactId: contacts[0].id } });
  await db.company.update({ where: { id: companies[1].id }, data: { mainContactId: contacts[2].id } });

  const year = new Date().getFullYear();
  const sessionsData = [
    {
      training: trainings[0],
      trainer: trainers[0],
      slots: [...fullDay(14), ...fullDay(15)],
      status: "published" as const,
      capacityMax: 8,
      external: true,
    },
    {
      training: trainings[1],
      trainer: trainers[1],
      slots: fullDay(21),
      status: "published" as const,
      capacityMax: 2,
      external: true,
    },
    {
      training: trainings[3],
      trainer: trainers[2],
      slots: [...fullDay(35), ...fullDay(36)],
      status: "draft" as const,
      capacityMax: 10,
      external: false,
    },
  ];
  const sessions = [];
  for (const item of sessionsData) {
    sessions.push(
      await db.trainingSession.create({
        data: {
          trainingId: item.training.id,
          reference: await nextReference(year),
          status: item.status,
          location: item.training.modality === "remote" ? null : "Salle Lumière, 12 rue de la Paix, Paris",
          videoLink: item.training.modality === "in_person" ? null : "https://meet.google.com/demo-demo-demo",
          capacityMax: item.capacityMax,
          capacityMin: 2,
          openToInternal: true,
          openToExternal: item.external,
          slots: { create: item.slots },
          trainers: { create: [{ trainerId: item.trainer.id }] },
        },
      }),
    );
  }

  // Session 1: three confirmed externals; session 2: full with a waitlist.
  const enroll = (
    sessionId: string,
    participantId: string,
    status: "confirmed" | "waitlisted",
    price: number,
    companyId: string | null,
    minutes: number,
  ) =>
    db.enrollment.create({
      data: {
        sessionId,
        participantId,
        status,
        source: "back_office",
        participantType: "external",
        fundingType: "company",
        // Demo data: the agreement is waived so that external enrollments are confirmed.
        ...(status === "confirmed"
          ? { agreementWaiverReason: "Données de démonstration", agreementWaivedAt: new Date() }
          : {}),
        appliedPrice: price,
        billingCompanyId: companyId,
        enrolledAt: new Date(Date.now() - minutes * 60_000),
      },
    });
  await enroll(sessions[0].id, contacts[0].id, "confirmed", 1250, companies[0].id, 300);
  await enroll(sessions[0].id, contacts[1].id, "confirmed", 1250, companies[0].id, 290);
  await enroll(sessions[0].id, contacts[2].id, "confirmed", 1250, companies[1].id, 280);
  await enroll(sessions[1].id, contacts[0].id, "confirmed", 590, companies[0].id, 200);
  await enroll(sessions[1].id, contacts[3].id, "confirmed", 590, companies[1].id, 190);
  await enroll(sessions[1].id, contacts[2].id, "waitlisted", 590, companies[1].id, 180);
  await db.trainingSession.update({ where: { id: sessions[1].id }, data: { status: "full" } });

  console.log(
    `Demo data created: ${trainings.length} trainings, ${trainers.length} trainers, ${companies.length} companies, ${sessions.length} sessions.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
