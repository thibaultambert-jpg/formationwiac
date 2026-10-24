import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

describe("security headers (E7)", () => {
  it("sends the expected headers", () => {
    const keys = securityHeaders(false).map((header) => header.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
  });

  it("forbids framing, plugins and foreign scripts", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("form-action 'self' https://accounts.google.com");
  });

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy(true)).toContain("'unsafe-eval'");
  });
});
