import { describe, expect, it } from "vitest";
import {
  checkUserAdministration,
  decideAccess,
  isAllowedGoogleAccount,
  resolveRoleOnSignIn,
} from "@/server/auth/policy";

const DOMAIN = "example.fr";

describe("isAllowedGoogleAccount", () => {
  it("accepts a verified account of the allowed Workspace domain", () => {
    expect(
      isAllowedGoogleAccount({ email: "Jane.Doe@Example.fr", emailVerified: true, hostedDomain: "example.fr" }, DOMAIN),
    ).toBe(true);
  });

  it("rejects a personal Gmail account", () => {
    expect(isAllowedGoogleAccount({ email: "jane@gmail.com", emailVerified: true, hostedDomain: null }, DOMAIN)).toBe(
      false,
    );
  });

  it("rejects another Workspace domain", () => {
    expect(
      isAllowedGoogleAccount({ email: "jane@other.fr", emailVerified: true, hostedDomain: "other.fr" }, DOMAIN),
    ).toBe(false);
  });

  it("rejects a mismatch between the hd claim and the email domain", () => {
    expect(
      isAllowedGoogleAccount({ email: "jane@other.fr", emailVerified: true, hostedDomain: "example.fr" }, DOMAIN),
    ).toBe(false);
    expect(
      isAllowedGoogleAccount({ email: "jane@example.fr", emailVerified: true, hostedDomain: "other.fr" }, DOMAIN),
    ).toBe(false);
  });

  it("rejects a look-alike domain suffix", () => {
    expect(
      isAllowedGoogleAccount({ email: "jane@evilexample.fr", emailVerified: true, hostedDomain: "example.fr" }, DOMAIN),
    ).toBe(false);
  });

  it("rejects an unverified email", () => {
    expect(
      isAllowedGoogleAccount({ email: "jane@example.fr", emailVerified: false, hostedDomain: "example.fr" }, DOMAIN),
    ).toBe(false);
  });

  it("rejects everything when no domain is configured", () => {
    expect(isAllowedGoogleAccount({ email: "jane@example.fr", emailVerified: true, hostedDomain: "" }, "")).toBe(false);
  });
});

describe("resolveRoleOnSignIn", () => {
  it("gives the employee role to a new account", () => {
    expect(resolveRoleOnSignIn("new@example.fr", null, "admin@example.fr")).toBe("employee");
  });

  it("keeps the existing role of a known account", () => {
    expect(resolveRoleOnSignIn("trainer@example.fr", "trainer", "admin@example.fr")).toBe("trainer");
  });

  it("always makes the initial admin email an admin, case-insensitively", () => {
    expect(resolveRoleOnSignIn("Admin@Example.fr", null, "admin@example.fr")).toBe("admin");
    expect(resolveRoleOnSignIn("admin@example.fr", "employee", "ADMIN@example.fr")).toBe("admin");
  });
});

describe("decideAccess", () => {
  it("lets anyone reach the login and auth routes", () => {
    expect(decideAccess("/connexion", null)).toBe("allow");
    expect(decideAccess("/acces-refuse", null)).toBe("allow");
    expect(decideAccess("/api/auth/callback/google", null)).toBe("allow");
    expect(decideAccess("/emargement/abc", null)).toBe("allow");
    expect(decideAccess("/evaluation/abc", null)).toBe("allow");
    expect(decideAccess("/questionnaire/abc", null)).toBe("allow");
    expect(decideAccess("/api/cron", null)).toBe("allow");
    expect(decideAccess("/emargements", null)).toBe("login");
  });

  it("publishes the legal pages without login (F1, F2, F3)", () => {
    expect(decideAccess("/confidentialite", null)).toBe("allow");
    expect(decideAccess("/mentions-legales", null)).toBe("allow");
    expect(decideAccess("/reglement-interieur", null)).toBe("allow");
    expect(decideAccess("/reglement-interieur/fichier", null)).toBe("allow");
  });

  it("sends anonymous visitors to the login page", () => {
    expect(decideAccess("/", null)).toBe("login");
    expect(decideAccess("/mes-formations", null)).toBe("login");
    expect(decideAccess("/admin", null)).toBe("login");
  });

  it("reserves /admin to administrators", () => {
    expect(decideAccess("/admin", "admin")).toBe("allow");
    expect(decideAccess("/admin/sessions", "admin")).toBe("allow");
    expect(decideAccess("/admin", "employee")).toBe("forbidden");
    expect(decideAccess("/admin/formations", "employee")).toBe("forbidden");
    expect(decideAccess("/admin", "trainer")).toBe("forbidden");
  });

  it("does not treat look-alike paths as admin routes", () => {
    expect(decideAccess("/administration", "employee")).toBe("allow");
  });

  it("reserves « Mes sessions » to trainers and administrators", () => {
    expect(decideAccess("/mes-sessions", "trainer")).toBe("allow");
    expect(decideAccess("/mes-sessions", "admin")).toBe("allow");
    expect(decideAccess("/mes-sessions", "employee")).toBe("forbidden");
  });

  it("lets every signed-in user reach the front", () => {
    expect(decideAccess("/", "employee")).toBe("allow");
    expect(decideAccess("/mes-formations", "employee")).toBe("allow");
  });
});

describe("checkUserAdministration", () => {
  const initial = "admin@example.fr";

  it("forbids changing one's own role or deactivating oneself", () => {
    expect(checkUserAdministration("me", { id: "me", email: "x@example.fr" }, { role: "employee" }, initial).ok).toBe(
      false,
    );
  });

  it("protects the initial admin account", () => {
    const target = { id: "a", email: "Admin@example.fr" };
    expect(checkUserAdministration("me", target, { role: "trainer" }, initial).ok).toBe(false);
    expect(checkUserAdministration("me", target, { active: false }, initial).ok).toBe(false);
    expect(checkUserAdministration("me", target, { role: "admin" }, initial).ok).toBe(true);
  });

  it("allows other changes", () => {
    expect(checkUserAdministration("me", { id: "b", email: "b@example.fr" }, { role: "admin" }, initial).ok).toBe(true);
  });
});
