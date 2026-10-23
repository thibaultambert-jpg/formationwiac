import { describe, expect, it } from "vitest";
import { buildIcs } from "@/server/email/ics";
import { base64Url, buildMime, encodeHeader } from "@/server/email/mime";
import { renderTemplate, textToHtml, unknownPlaceholders } from "@/server/email/template";

describe("email templates", () => {
  it("replaces known variables, with or without spaces", () => {
    expect(renderTemplate("Bonjour {{prenom}}, {{ formation }} !", { prenom: "Inès", formation: "Excel" })).toBe(
      "Bonjour Inès, Excel !",
    );
  });

  it("keeps unknown placeholders and reports them", () => {
    expect(renderTemplate("{{prenom}} {{inconnu}}", { prenom: "A" })).toBe("A {{inconnu}}");
    expect(unknownPlaceholders("{{prenom}} {{inconnu}} {{inconnu}}")).toEqual(["inconnu"]);
  });

  it("renders safe HTML with links and line breaks", () => {
    const html = textToHtml("Bonjour <b>Inès</b>,\nligne 2\n\nLien : https://exemple.fr/a?b=1");
    expect(html).toContain("Bonjour &lt;b&gt;Inès&lt;/b&gt;,<br>ligne 2");
    expect(html).toContain('<a href="https://exemple.fr/a?b=1">https://exemple.fr/a?b=1</a>');
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

describe("ics", () => {
  const ics = buildIcs(
    [
      {
        uid: "slot-1@test",
        startsAt: new Date("2026-11-02T08:00:00Z"),
        endsAt: new Date("2026-11-02T11:30:00Z"),
        summary: "Excel, niveau 2; avancé",
        location: "Salle A",
        description: "Ligne 1\nLigne 2",
      },
    ],
    { now: new Date("2026-10-22T10:00:00Z") },
  );

  it("writes UTC events with escaped text and CRLF", () => {
    expect(ics).toContain("DTSTART:20261102T080000Z\r\n");
    expect(ics).toContain("DTEND:20261102T113000Z\r\n");
    expect(ics).toContain("SUMMARY:Excel\\, niveau 2\; avancé\r\n");
    expect(ics).toContain("DESCRIPTION:Ligne 1\\nLigne 2\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 octets", () => {
    const long = buildIcs([{ uid: "u", startsAt: new Date(), endsAt: new Date(), summary: "é".repeat(80) }]);
    for (const line of long.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});

describe("mime", () => {
  it("encodes non-ASCII headers", () => {
    expect(encodeHeader("Hello")).toBe("Hello");
    expect(encodeHeader("Événement")).toBe(`=?UTF-8?B?${Buffer.from("Événement").toString("base64")}?=`);
  });

  it("builds a multipart message with alternative bodies and attachments", () => {
    const raw = buildMime(
      {
        from: { name: "Organisme", email: "formation@example.fr" },
        to: "ines@example.fr",
        subject: "Confirmation d'inscription",
        text: "Bonjour",
        html: "<p>Bonjour</p>",
        attachments: [{ filename: "session.ics", contentType: "text/calendar", content: "BEGIN:VCALENDAR" }],
      },
      { boundary: "b1", date: new Date("2026-10-22T10:00:00Z") },
    );
    expect(raw).toContain("From: Organisme <formation@example.fr>\r\n");
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="b1"');
    expect(raw).toContain("Content-Type: text/html; charset=UTF-8");
    expect(raw).toContain('Content-Disposition: attachment; filename="session.ics"');
    expect(raw).toContain(Buffer.from("BEGIN:VCALENDAR").toString("base64"));
    expect(raw.trimEnd().endsWith("--b1--")).toBe(true);
  });

  it("produces URL-safe base64 without padding", () => {
    expect(base64Url(Buffer.from([0xfb, 0xff]))).toBe("-_8");
  });
});

describe("eml preview", () => {
  it("reads back headers, text body and attachment names", async () => {
    const { parseEml } = await import("@/server/email/eml");
    const raw = buildMime({
      from: { name: "Organisme é", email: "a@example.fr" },
      to: "b@example.fr",
      subject: "Inscription confirmée",
      text: "Bonjour Inès",
      html: "<p>Bonjour Inès</p>",
      attachments: [{ filename: "FORM-2026-001.ics", contentType: "text/calendar", content: "X" }],
    });
    const parsed = parseEml(raw);
    expect(parsed.headers.subject).toBe("Inscription confirmée");
    expect(parsed.headers.to).toBe("b@example.fr");
    expect(parsed.text).toBe("Bonjour Inès");
    expect(parsed.attachments).toEqual(["FORM-2026-001.ics"]);
  });
});
