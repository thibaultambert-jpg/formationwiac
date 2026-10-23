import "server-only";
import { Document, Image, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { formatDate, formatTime, formatWeekday } from "@/lib/dates";
import { MODALITY_LABELS } from "@/lib/labels";
import { ACTION_NATURE } from "@/server/domain/compliance";
import { formatDecimal } from "@/server/domain/numbers";
import { totalHours, type TimeRange } from "@/server/domain/slots";
import type { Organization } from "@/server/pdf/data";
import { OrgFooter, OrgHeader, signatureSource, slotText, styles } from "@/server/pdf/styles";

const fmt = { date: formatDate, time: formatTime };

export type ConventionData = {
  reference: string;
  issuedAt: Date;
  organization: Organization;
  company: { name: string; address: string; siret: string | null };
  training: {
    title: string;
    objectives: string;
    prerequisites: string | null;
    modality: keyof typeof MODALITY_LABELS;
  };
  session: { reference: string; slots: TimeRange[]; location: string | null; videoLink: string | null };
  trainees: { firstName: string; lastName: string; jobTitle: string | null }[];
  priceExclTax: number | null;
  financialTerms: string | null;
};

const amountFormatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Amount in euros; Intl's narrow no-break spaces are outside the PDF built-in font. */
function euros(value: number): string {
  return `${amountFormatter.format(value).replace(/[\u202f\u00a0]/g, " ")} EUR`;
}

function Article({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={styles.h2}>
        Article {number} - {title}
      </Text>
      {children}
    </View>
  );
}

/** Convention de formation professionnelle (articles L6353-1 et suivants du Code du travail). */
export async function renderConvention(data: ConventionData): Promise<Buffer> {
  const { organization, company, training, session } = data;
  const signatory = [organization.managerName, organization.managerTitle].filter(Boolean).join(", ");
  const hours = totalHours(session.slots);
  const place =
    [session.location, session.videoLink ? `Classe virtuelle : ${session.videoLink}` : null]
      .filter(Boolean)
      .join(" - ") || "A préciser";

  return renderToBuffer(
    <Document title={`Convention ${data.reference}`} author={organization.name} language="fr">
      <Page size="A4" style={styles.page}>
        <OrgHeader organization={organization} />
        <Text style={styles.title}>Convention de formation professionnelle</Text>
        <Text style={styles.label}>
          N° {data.reference} - établie le {formatDate(data.issuedAt)} (articles L6353-1 et suivants du Code du travail)
        </Text>

        <Text style={styles.h2}>Entre les soussignés</Text>
        <Text>
          <Text style={styles.bold}>{organization.name}</Text>
          {organization.address ? `, ${organization.address}` : ""}
          {organization.siret ? `, SIRET ${organization.siret}` : ""}
          {organization.activityDeclarationNumber
            ? `, déclaration d'activité enregistrée sous le n° ${organization.activityDeclarationNumber} (cet enregistrement ne vaut pas agrément de l'État)`
            : ""}
          {signatory ? `, représenté par ${signatory}` : ""}, ci-après « l&apos;organisme de formation »,
        </Text>
        <Text style={{ marginTop: 4 }}>
          et <Text style={styles.bold}>{company.name}</Text>
          {company.address ? `, ${company.address}` : ""}
          {company.siret ? `, SIRET ${company.siret}` : ""}, ci-après « l&apos;entreprise ».
        </Text>

        <Article number={1} title="Objet">
          <Text>
            L&apos;organisme de formation s&apos;engage à organiser l&apos;action de formation intitulée{" "}
            <Text style={styles.bold}>{training.title}</Text> ({session.reference}). Nature de l&apos;action :{" "}
            {ACTION_NATURE}.
          </Text>
          <Text style={{ marginTop: 4 }}>Objectifs : {training.objectives}</Text>
          <Text style={{ marginTop: 4 }}>Prérequis : {training.prerequisites ?? "aucun"}.</Text>
        </Article>

        <Article number={2} title="Dates, durée, lieu et modalités">
          {session.slots.map((slot, index) => (
            <Text key={index}>
              - {formatWeekday(slot.startsAt)} {slotText(slot.startsAt, slot.endsAt, fmt)}
            </Text>
          ))}
          <Text style={{ marginTop: 4 }}>
            Durée totale : {formatDecimal(hours)} heures. Modalité : {MODALITY_LABELS[training.modality]}. Lieu :{" "}
            {place}.
          </Text>
          <Text style={{ marginTop: 4 }}>
            Le programme détaillé, les moyens pédagogiques et les modalités d&apos;évaluation des acquis sont annexés à
            la présente convention. Une attestation de fin de formation et un certificat de réalisation sont remis à
            chaque stagiaire, sur la base des feuilles d&apos;émargement signées par demi-journée.
          </Text>
        </Article>

        <Article number={3} title="Stagiaires">
          {data.trainees.map((trainee, index) => (
            <Text key={index}>
              - {trainee.firstName} {trainee.lastName}
              {trainee.jobTitle ? `, ${trainee.jobTitle}` : ""}
            </Text>
          ))}
        </Article>

        <Article number={4} title="Dispositions financières">
          <Text>
            Prix de l&apos;action : {data.priceExclTax !== null ? `${euros(data.priceExclTax)} HT` : "à préciser"} pour{" "}
            {data.trainees.length} stagiaire{data.trainees.length > 1 ? "s" : ""}, TVA en sus au taux en vigueur le cas
            échéant.
          </Text>
          {data.financialTerms ? <Text style={{ marginTop: 4 }}>{data.financialTerms}</Text> : null}
        </Article>

        <Article number={5} title="Dédit, abandon et annulation">
          <Text>
            En cas d&apos;abandon d&apos;un stagiaire ou d&apos;annulation par l&apos;entreprise, seules les heures
            réellement suivies sont dues au titre de la formation professionnelle ; les sommes éventuellement dues à
            titre de dédommagement ne peuvent être imputées sur la participation au développement de la formation
            professionnelle ni faire l&apos;objet d&apos;une prise en charge par un financeur.
          </Text>
        </Article>

        <Article number={6} title="Règlement intérieur, accessibilité et litiges">
          <Text>
            Les stagiaires sont soumis au règlement intérieur de l&apos;organisme de formation, communiqué avant la
            formation. Tout besoin d&apos;adaptation lié à une situation de handicap peut être signalé au référent
            handicap de l&apos;organisme. Tout différend sera, à défaut d&apos;accord amiable, porté devant les
            tribunaux compétents.
          </Text>
        </Article>

        <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 28 }}>
          <View style={{ width: 220 }}>
            <Text style={styles.bold}>Pour l&apos;organisme de formation</Text>
            <Text>{signatory || organization.name}</Text>
            {organization.managerSignature ? (
              <Image style={styles.signature} src={signatureSource(organization.managerSignature)} />
            ) : (
              <View style={{ height: 50 }} />
            )}
          </View>
          <View style={{ width: 220 }}>
            <Text style={styles.bold}>Pour l&apos;entreprise</Text>
            <Text>Nom, qualité, date, cachet et signature</Text>
            <Text style={{ color: "#6b7280" }}>précédés de la mention « Bon pour accord »</Text>
            <View style={{ height: 50 }} />
          </View>
        </View>
        <OrgFooter organization={organization} />
      </Page>
    </Document>,
  );
}
