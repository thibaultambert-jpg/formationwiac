import "server-only";
import { Document, Image, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { formatDate, formatTime, formatWeekday } from "@/lib/dates";
import { MODALITY_LABELS } from "@/lib/labels";
import { attended as attendedSlot, signedHours } from "@/server/domain/attendance-proof";
import { ACTION_NATURE } from "@/server/domain/compliance";
import { formatDecimal } from "@/server/domain/numbers";
import { totalHours } from "@/server/domain/slots";
import type { SessionDocuments } from "@/server/pdf/data";
import { OrgFooter, OrgHeader, signatureSource, slotText, styles } from "@/server/pdf/styles";

const fmt = { date: formatDate, time: formatTime };

type Enrollment = SessionDocuments["session"]["enrollments"][number];

function participantLine(enrollment: Enrollment): string {
  const { participant } = enrollment;
  return `${participant.firstName} ${participant.lastName}${participant.company ? ` (${participant.company.name})` : ""}`;
}

function place(session: SessionDocuments["session"]): string {
  return (
    [session.location, session.videoLink ? `Classe virtuelle : ${session.videoLink}` : null]
      .filter(Boolean)
      .join("\n") || "A préciser"
  );
}

export async function renderConvocation(documents: SessionDocuments, enrollment: Enrollment): Promise<Buffer> {
  const { session, organization } = documents;
  const trainers = session.trainers.map(({ trainer }) => `${trainer.firstName} ${trainer.lastName}`).join(", ");
  return renderToBuffer(
    <Document title={`Convocation ${session.reference}`} author={organization.name} language="fr">
      <Page size="A4" style={styles.page}>
        <OrgHeader organization={organization} />
        <Text style={styles.title}>Convocation à la formation</Text>
        <Text>
          <Text style={styles.label}>Participant : </Text>
          <Text style={styles.bold}>{participantLine(enrollment)}</Text>
        </Text>
        <Text>
          <Text style={styles.label}>Formation : </Text>
          <Text style={styles.bold}>{session.training.title}</Text> ({session.reference})
        </Text>
        <Text style={styles.h2}>Dates et horaires</Text>
        {session.slots.map((slot) => (
          <Text key={slot.id}>
            - {formatWeekday(slot.startsAt)} {slotText(slot.startsAt, slot.endsAt, fmt)}
          </Text>
        ))}
        <Text>Durée totale : {formatDecimal(totalHours(session.slots))} heures</Text>
        <Text style={styles.h2}>Lieu</Text>
        <Text>{place(session)}</Text>
        {session.accessInfo ? (
          <>
            <Text style={styles.h2}>Accès et informations pratiques</Text>
            <Text>{session.accessInfo}</Text>
          </>
        ) : null}
        {trainers ? (
          <>
            <Text style={styles.h2}>Formateur{session.trainers.length > 1 ? "s" : ""}</Text>
            <Text>{trainers}</Text>
          </>
        ) : null}
        <Text style={styles.h2}>Prérequis</Text>
        <Text>{session.training.prerequisites ?? "Aucun prérequis."}</Text>
        {session.training.thingsToBring ? (
          <>
            <Text style={styles.h2}>Matériel ou documents à prévoir</Text>
            <Text>{session.training.thingsToBring}</Text>
          </>
        ) : null}
        <Text style={styles.h2}>Contact</Text>
        <Text>
          {organization.name}
          {organization.contactEmail ? ` - ${organization.contactEmail}` : ""}
        </Text>
        <Text style={{ marginTop: 16 }}>Merci de vous présenter quelques minutes avant le début de la formation.</Text>
        <OrgFooter organization={organization} />
      </Page>
    </Document>,
  );
}

const SLOTS_PER_PAGE = 4;

const CORRECTION_TEXT: Record<string, string> = {
  absent: "Absent",
  late: "Retard, arrivée à",
  left_early: "Départ anticipé à",
  present: "Présent (déclaré)",
};

/** One row per participant, one column per slot (half-day), with signatures. */
export async function renderAttendanceSheet(
  documents: SessionDocuments,
  options: { final: boolean; generatedAt?: Date } = { final: false },
): Promise<Buffer> {
  const { session, organization, signatures, trainerSignatures, cells, fingerprint } = documents;
  const generatedAt = options.generatedAt ?? new Date();
  const pages: (typeof session.slots)[] = [];
  for (let index = 0; index < Math.max(session.slots.length, 1); index += SLOTS_PER_PAGE) {
    pages.push(session.slots.slice(index, index + SLOTS_PER_PAGE));
  }
  const nameWidth = 170;
  // Once the session is closed, an unsigned slot is an absence.
  const closed = session.status === "completed";
  const cell = { borderRight: "1pt solid #d1d5db", padding: 4, justifyContent: "center" as const };
  const row = { flexDirection: "row" as const, borderBottom: "1pt solid #d1d5db", minHeight: 52 };

  return renderToBuffer(
    <Document title={`Feuille d'émargement ${session.reference}`} author={organization.name} language="fr">
      {pages.map((slots, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={styles.page}>
          <OrgHeader organization={organization} />
          <Text style={styles.title}>Feuille d&apos;émargement</Text>
          <Text>
            <Text style={styles.bold}>{session.training.title}</Text> - {session.reference} -{" "}
            {place(session).split("\n")[0]}
          </Text>
          <View style={{ marginTop: 12, borderTop: "1pt solid #d1d5db", borderLeft: "1pt solid #d1d5db" }}>
            <View style={{ ...row, minHeight: 30, backgroundColor: "#f3f4f6" }}>
              <Text style={{ ...cell, width: nameWidth, fontFamily: "Helvetica-Bold" }}>Participant</Text>
              {slots.map((slot) => (
                <Text key={slot.id} style={{ ...cell, flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                  {slotText(slot.startsAt, slot.endsAt, fmt)}
                </Text>
              ))}
            </View>
            {session.enrollments.map((enrollment) => (
              <View key={enrollment.id} style={row} wrap={false}>
                <Text style={{ ...cell, width: nameWidth }}>{participantLine(enrollment)}</Text>
                {slots.map((slot) => {
                  const state = cells.get(`${enrollment.id}:${slot.id}`)!;
                  const image = signatures.get(`${enrollment.id}:${slot.id}`);
                  const signedAt = state.attendance?.method ? state.attendance.signedAt : null;
                  const correction = state.correction;
                  return (
                    <View key={slot.id} style={{ ...cell, flex: 1, alignItems: "center" }}>
                      {image ? (
                        <Image style={{ height: 32, objectFit: "contain" }} src={signatureSource(image)} />
                      ) : null}
                      {signedAt ? (
                        <Text style={{ fontSize: 7, color: "#6b7280" }}>
                          {state.attendance?.method === "attestation_checkbox" ? "Attestation sur l'honneur - " : ""}
                          Signé le {formatDate(signedAt)} à {formatTime(signedAt)}
                        </Text>
                      ) : null}
                      {correction ? (
                        <Text style={{ fontSize: 7, color: correction.state === "absent" ? "#b91c1c" : "#92400e" }}>
                          {CORRECTION_TEXT[correction.state]}
                          {correction.eventAt ? ` ${formatTime(correction.eventAt)}` : ""} : {correction.reason}
                        </Text>
                      ) : state.state === "present" && !signedAt ? (
                        <Text style={{ fontSize: 7, color: "#6b7280" }}>Présent (saisie BO)</Text>
                      ) : state.state === "absent" || (state.state === "unknown" && closed) ? (
                        <Text style={{ fontSize: 8, color: "#b91c1c" }}>Absent</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
            {session.trainers.map(({ trainer }) => (
              <View key={trainer.id} style={{ ...row, backgroundColor: "#f9fafb" }} wrap={false}>
                <Text style={{ ...cell, width: nameWidth }}>
                  Formateur : {trainer.firstName} {trainer.lastName}
                </Text>
                {slots.map((slot) => {
                  const image = trainerSignatures.get(`${trainer.id}:${slot.id}`);
                  return (
                    <View key={slot.id} style={{ ...cell, flex: 1, alignItems: "center" }}>
                      {image ? (
                        <Image style={{ height: 36, objectFit: "contain" }} src={signatureSource(image)} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 8, fontSize: 7, color: "#6b7280" }}>
            {options.final ? "Feuille définitive" : "Feuille provisoire"} générée le {formatDate(generatedAt)} à{" "}
            {formatTime(generatedAt)}. Heures en heure de Paris, horodatées par le serveur. Empreinte SHA-256 des
            émargements : {fingerprint}
          </Text>
          <OrgFooter organization={organization} />
        </Page>
      ))}
    </Document>,
  );
}

/** Attestation de fin de formation, with the duration actually attended (rule 8). */
export async function renderCertificate(documents: SessionDocuments, enrollment: Enrollment): Promise<Buffer> {
  const { session, organization } = documents;
  const attended = session.slots.filter((slot) =>
    attendedSlot(documents.cells.get(`${enrollment.id}:${slot.id}`)?.state ?? "unknown"),
  );
  const first = session.slots[0];
  const last = session.slots.at(-1);
  const signatory = [organization.managerName, organization.managerTitle].filter(Boolean).join(", ");

  return renderToBuffer(
    <Document title={`Attestation ${session.reference}`} author={organization.name} language="fr">
      <Page size="A4" style={styles.page}>
        <OrgHeader organization={organization} />
        <Text style={styles.title}>Attestation de fin de formation</Text>
        <Text>
          {signatory
            ? `Je soussigné(e) ${signatory}, représentant ${organization.name}, atteste que :`
            : `${organization.name} atteste que :`}
        </Text>
        <Text style={{ ...styles.bold, fontSize: 13, marginVertical: 12, textAlign: "center" }}>
          {participantLine(enrollment)}
        </Text>
        <Text>a suivi la formation :</Text>
        <Text style={{ ...styles.bold, fontSize: 12, marginVertical: 8, textAlign: "center" }}>
          {session.training.title}
        </Text>
        <Text>
          {first && last ? `du ${formatDate(first.startsAt)} au ${formatDate(last.endsAt)}` : ""} ({session.reference}),
          pour une durée suivie de <Text style={styles.bold}>{formatDecimal(totalHours(attended))} heures</Text> sur{" "}
          {formatDecimal(totalHours(session.slots))} heures prévues.
        </Text>
        <Text style={{ marginTop: 6 }}>
          Nature de l&apos;action : {ACTION_NATURE}. Modalité : {MODALITY_LABELS[session.training.modality]}.
        </Text>
        <Text style={styles.h2}>Objectifs de la formation</Text>
        <Text>{session.training.objectives}</Text>
        <View style={{ marginTop: 32, alignSelf: "flex-end", alignItems: "center", width: 220 }}>
          <Text>
            Fait {organization.city ? `à ${organization.city}, ` : ""}le {formatDate(last?.endsAt ?? new Date())}
          </Text>
          {organization.managerSignature ? (
            <Image style={styles.signature} src={signatureSource(organization.managerSignature)} />
          ) : (
            <View style={{ height: 50 }} />
          )}
          <Text>{signatory || organization.name}</Text>
        </View>
        <OrgFooter organization={organization} />
      </Page>
    </Document>,
  );
}

/** Hours actually signed by the trainee (B6): slots with a signature, not corrected to an absence. */
export function completionHours(documents: SessionDocuments, enrollment: Enrollment): number {
  return signedHours(
    documents.session.slots.map((slot) => ({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      attendance: documents.cells.get(`${enrollment.id}:${slot.id}`) ?? {
        state: "unknown",
        signed: false,
        corrected: false,
      },
    })),
  );
}

const ACTION_KINDS = [
  { label: "action de formation", checked: true },
  { label: "bilan de compétences", checked: false },
  { label: "action de VAE", checked: false },
  { label: "action de formation par apprentissage", checked: false },
];

/**
 * Certificate of completion (certificat de réalisation, B6), following the
 * model of the French Ministry of Labour: only signed hours are counted.
 */
export async function renderCompletionCertificate(documents: SessionDocuments, enrollment: Enrollment): Promise<Buffer> {
  const { session, organization } = documents;
  const first = session.slots[0];
  const last = session.slots.at(-1);
  const signatory = [organization.managerName, organization.managerTitle].filter(Boolean).join(", ");
  const { participant } = enrollment;

  return renderToBuffer(
    <Document title={`Certificat de réalisation ${session.reference}`} author={organization.name} language="fr">
      <Page size="A4" style={styles.page}>
        <OrgHeader organization={organization} />
        <Text style={styles.title}>Certificat de réalisation</Text>
        <Text>
          Je soussigné(e) {signatory || "le représentant légal"}, représentant légal du dispensateur de l&apos;action
          concourant au développement des compétences {organization.name}
          {organization.activityDeclarationNumber
            ? ` (déclaration d'activité n° ${organization.activityDeclarationNumber})`
            : ""}
          , atteste que :
        </Text>
        <Text style={{ ...styles.bold, fontSize: 13, marginVertical: 12, textAlign: "center" }}>
          {participant.firstName} {participant.lastName}
        </Text>
        <Text>
          {participant.company ? `salarié(e) de l'entreprise ${participant.company.name}, ` : ""}a suivi l&apos;action :
        </Text>
        <Text style={{ ...styles.bold, fontSize: 12, marginVertical: 8, textAlign: "center" }}>
          {session.training.title}
        </Text>
        <Text style={{ marginBottom: 4 }}>Nature de l&apos;action concourant au développement des compétences :</Text>
        {ACTION_KINDS.map((kind) => (
          <Text key={kind.label} style={{ marginLeft: 12 }}>
            {kind.checked ? "[X]" : "[  ]"} {kind.label}
          </Text>
        ))}
        <Text style={{ marginTop: 8 }}>
          qui s&apos;est déroulée {first && last ? `du ${formatDate(first.startsAt)} au ${formatDate(last.endsAt)}` : ""}{" "}
          ({session.reference}, {MODALITY_LABELS[session.training.modality].toLowerCase()}), pour une durée réalisée de{" "}
          <Text style={styles.bold}>{formatDecimal(completionHours(documents, enrollment))} heures</Text> (heures
          émargées) sur {formatDecimal(totalHours(session.slots))} heures prévues.
        </Text>
        <Text style={{ marginTop: 12, fontSize: 9 }}>
          Sans préjudice des délais imposés par les règles fixées par le financeur pour la transmission des pièces
          justificatives, le bénéficiaire et son employeur s&apos;engagent à conserver ce certificat pendant 3 ans à
          compter de la fin de l&apos;année du dernier paiement. En cas de contrôle, des pièces complémentaires pourront
          être demandées.
        </Text>
        <View style={{ marginTop: 32, alignSelf: "flex-end", alignItems: "center", width: 240 }}>
          <Text>
            Fait {organization.city ? `à ${organization.city}, ` : ""}le {formatDate(last?.endsAt ?? new Date())}
          </Text>
          <Text style={{ fontSize: 9, marginTop: 2 }}>Cachet et signature du responsable du dispensateur</Text>
          {organization.managerSignature ? (
            <Image style={styles.signature} src={signatureSource(organization.managerSignature)} />
          ) : (
            <View style={{ height: 50 }} />
          )}
          <Text>{signatory || organization.name}</Text>
        </View>
        <OrgFooter organization={organization} />
      </Page>
    </Document>,
  );
}
