import type { Role } from "@/server/auth/policy";

/**
 * Users linked to an active internal trainer record get the trainer role;
 * administrators are never downgraded, and a trainer without any active link
 * goes back to collaborator.
 */
export function roleForTrainerLink(currentRole: Role, hasActiveInternalTrainer: boolean): Role {
  if (currentRole === "admin") return "admin";
  return hasActiveInternalTrainer ? "trainer" : "employee";
}
