"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { displayName, requireRole } from "@/server/auth/guards";

export type SearchOption = {
  id: string;
  label: string;
  description?: string;
  data?: Record<string, string | null>;
};

const LIMIT = 10;

function words(q: string): string[] {
  return String(q ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

/** Active Google accounts, for internal trainers and internal enrollments. */
export async function searchUsers(q: string): Promise<SearchOption[]> {
  await requireRole(["admin"]);
  const terms = words(q);
  if (terms.length === 0) return [];
  const users = await db.user.findMany({
    where: {
      active: true,
      AND: terms.map((term) => ({
        OR: [
          { email: { contains: term, mode: "insensitive" as const } },
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: LIMIT,
  });
  return users.map((user) => ({
    id: user.id,
    label: displayName(user),
    description: [user.email, user.department].filter(Boolean).join(" · "),
    data: { firstName: user.firstName, lastName: user.lastName, email: user.email },
  }));
}

/** Companies by name or SIRET, excluding merged and archived ones. */
export async function searchCompanies(q: string): Promise<SearchOption[]> {
  await requireRole(["admin"]);
  const term = String(q ?? "").trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\s/g, "");
  const companies = await db.company.findMany({
    where: {
      mergedIntoId: null,
      archivedAt: null,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        ...(/^\d{3,14}$/.test(digits) ? [{ siret: { startsWith: digits } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    take: LIMIT,
  });
  return companies.map((company) => ({
    id: company.id,
    label: company.name,
    description: [company.siret ? `SIRET ${company.siret}` : null, company.city].filter(Boolean).join(" · "),
  }));
}

/** External contacts, optionally restricted to one company. */
export async function searchExternalParticipants(q: string, companyId?: string): Promise<SearchOption[]> {
  await requireRole(["admin"]);
  if (companyId !== undefined && !z.uuid().safeParse(companyId).success) return [];
  const terms = words(typeof q === "string" ? q : "");
  if (terms.length === 0 && !companyId) return [];
  const participants = await db.participant.findMany({
    where: {
      type: "external",
      archivedAt: null,
      anonymizedAt: null,
      ...(companyId ? { companyId } : {}),
      AND: terms.map((term) => ({
        OR: [
          { email: { contains: term, mode: "insensitive" as const } },
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    include: { company: { select: { name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: LIMIT,
  });
  return participants.map((participant) => ({
    id: participant.id,
    label: `${participant.firstName} ${participant.lastName}`,
    description: [participant.email, participant.company?.name].filter(Boolean).join(" · "),
  }));
}
