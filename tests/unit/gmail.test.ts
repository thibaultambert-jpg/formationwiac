import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAssertion, parseServiceAccountKey } from "@/server/email/gmail";

describe("Gmail service account assertion", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("parses a JSON key with escaped newlines", () => {
    const key = parseServiceAccountKey(
      JSON.stringify({ client_email: "sa@project.iam.gserviceaccount.com", private_key: pem.replace(/\n/g, "\\n") }),
    );
    expect(key.private_key).toBe(pem);
  });

  it("signs an RS256 JWT impersonating the sender with the gmail.send scope only", () => {
    const jwt = buildAssertion(
      { client_email: "sa@project.iam.gserviceaccount.com", private_key: pem },
      "formation@example.fr",
      1_800_000_000_000,
    );
    const [header, claims, signature] = jwt.split(".");
    const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: "sa@project.iam.gserviceaccount.com",
      sub: "formation@example.fr",
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("rejects a JSON that is not a service account key", () => {
    expect(() => parseServiceAccountKey("{}")).toThrow();
  });
});
