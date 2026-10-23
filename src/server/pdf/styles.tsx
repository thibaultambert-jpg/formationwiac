import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ImageData, Organization } from "@/server/pdf/data";

// Built-in Helvetica (WinAnsi): avoid characters outside Latin-1 such as arrows.
// No lineHeight on the page: with @react-pdf 4 it hides the fixed footer.

export const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  logo: { height: 40, maxWidth: 140, objectFit: "contain" },
  org: { fontSize: 9, textAlign: "right", color: "#4b5563" },
  orgName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 16, color: "#1e3a8a" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  label: { color: "#4b5563" },
  bold: { fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#6b7280", textAlign: "center" },
  signature: { height: 50, maxWidth: 160, objectFit: "contain" },
});

export function signatureSource(image: ImageData) {
  return { data: image.data, format: image.format };
}

export function OrgHeader({ organization }: { organization: Organization }) {
  return (
    <View style={styles.header}>
      {organization.logo ? <Image style={styles.logo} src={signatureSource(organization.logo)} /> : <View />}
      <View style={styles.org}>
        <Text style={styles.orgName}>{organization.name}</Text>
        {organization.address ? <Text>{organization.address}</Text> : null}
        {organization.contactEmail ? <Text>{organization.contactEmail}</Text> : null}
      </View>
    </View>
  );
}

export function OrgFooter({ organization }: { organization: Organization }) {
  const parts = [
    organization.name,
    organization.siret ? `SIRET ${organization.siret}` : null,
    organization.activityDeclarationNumber
      ? `Déclaration d'activité n° ${organization.activityDeclarationNumber}`
      : null,
  ].filter(Boolean);
  return (
    <Text
      style={styles.footer}
      fixed
      render={({ pageNumber, totalPages }) => `${parts.join(" - ")}    Page ${pageNumber}/${totalPages}`}
    />
  );
}

/** Plain-ASCII time range, safe for the built-in PDF fonts. */
export function slotText(
  startsAt: Date,
  endsAt: Date,
  format: { date: (d: Date) => string; time: (d: Date) => string },
) {
  return `${format.date(startsAt)} ${format.time(startsAt)} - ${format.time(endsAt)}`;
}
