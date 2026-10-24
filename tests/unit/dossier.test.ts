import { describe, expect, it } from "vitest";
import { addUnique, attachmentSummary, safeFileName } from "@/server/domain/dossier";

describe("session dossier (I1)", () => {
  it("builds safe file names", () => {
    expect(safeFileName("Convocation — Élodie Dupré.pdf")).toBe("convocation-elodie-dupre.pdf");
    expect(safeFileName("///")).toBe("fichier");
  });

  it("never overwrites a ZIP entry", () => {
    const files: Record<string, Uint8Array> = {};
    expect(addUnique(files, "a/doc.pdf", new Uint8Array([1]))).toBe("a/doc.pdf");
    expect(addUnique(files, "a/doc.pdf", new Uint8Array([2]))).toBe("a/doc-2.pdf");
    expect(addUnique(files, "a/doc.pdf", new Uint8Array([3]))).toBe("a/doc-3.pdf");
    expect(addUnique(files, "readme", new Uint8Array([4]))).toBe("readme");
    expect(addUnique(files, "readme", new Uint8Array([5]))).toBe("readme-2");
  });

  it("summarizes the attachments of an email", () => {
    expect(
      attachmentSummary([
        { name: "programme.pdf", sha256: "abc" },
        { name: "reglement.pdf", sha256: "def", version: "2" },
      ]),
    ).toBe("programme.pdf (abc) | reglement.pdf v2 (def)");
    expect(attachmentSummary(null)).toBe("");
  });
});
