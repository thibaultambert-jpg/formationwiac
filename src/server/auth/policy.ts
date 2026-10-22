// Pure authorization rules, shared by the proxy, Auth.js callbacks and server
// guards. Kept free of I/O so they can be unit tested.

export const ROLES = ["admin", "trainer", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  trainer: "Formateur",
  employee: "Collaborateur",
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type GoogleAccountClaims = {
  email?: string | null;
  emailVerified?: boolean | null;
  hostedDomain?: string | null;
};

/**
 * A Google account is allowed only if its `hd` claim matches the allowed
 * Workspace domain, its email belongs to that domain and is verified.
 */
export function isAllowedGoogleAccount(claims: GoogleAccountClaims, allowedDomain: string): boolean {
  const domain = allowedDomain.trim().toLowerCase();
  if (!domain || !claims.email || claims.emailVerified !== true) return false;
  if (claims.hostedDomain?.trim().toLowerCase() !== domain) return false;
  return normalizeEmail(claims.email).endsWith(`@${domain}`);
}

/**
 * New accounts are collaborators; the initial admin email is always admin so
 * the application can never be locked out of its back-office.
 */
export function resolveRoleOnSignIn(email: string, existingRole: Role | null, initialAdminEmail: string): Role {
  if (normalizeEmail(email) === normalizeEmail(initialAdminEmail)) return "admin";
  return existingRole ?? "employee";
}

const PUBLIC_PATH_PREFIXES = ["/connexion", "/acces-refuse", "/api/auth"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function requiredRolesForPath(pathname: string): readonly Role[] | null {
  if (matchesPrefix(pathname, "/admin")) return ["admin"];
  if (matchesPrefix(pathname, "/mes-sessions")) return ["trainer", "admin"];
  return null;
}

export type AccessDecision = "allow" | "login" | "forbidden";

export function decideAccess(pathname: string, role: Role | null): AccessDecision {
  if (isPublicPath(pathname)) return "allow";
  if (!role) return "login";
  const required = requiredRolesForPath(pathname);
  if (required && !required.includes(role)) return "forbidden";
  return "allow";
}

export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
