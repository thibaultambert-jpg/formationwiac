import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { Prisma } from "@/generated/prisma/client";
import { displayName, requireRole } from "@/server/auth/guards";
import { ROLE_LABELS, ROLES, type Role } from "@/server/auth/policy";
import { UserForm } from "./user-form";

export const metadata: Metadata = { title: "Utilisateurs et rôles" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/parametres/utilisateurs">) {
  const actor = await requireRole(["admin"]);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const role =
    typeof params.role === "string" && (ROLES as readonly string[]).includes(params.role)
      ? (params.role as Role)
      : null;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const users = await db.user.findMany({ where, orderBy: [{ lastName: "asc" }, { email: "asc" }], take: 200 });

  return (
    <section aria-labelledby="users-title" className="space-y-6">
      <div className="space-y-1">
        <h2 id="users-title" className="text-lg font-semibold">
          Utilisateurs et rôles
        </h2>
        <p className="text-muted-foreground text-sm">
          Les comptes sont créés à la première connexion Google avec le rôle Collaborateur. Le rôle Formateur est
          attribué automatiquement quand une fiche formateur interne est liée au compte.
        </p>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="users-q">Rechercher</Label>
          <Input id="users-q" name="q" defaultValue={q} placeholder="Nom ou email" />
        </div>
        <div className="space-y-1.5 sm:w-48">
          <Label htmlFor="users-role">Rôle</Label>
          <NativeSelect id="users-role" name="role" defaultValue={role ?? ""}>
            <option value="">Tous</option>
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
      </form>

      {users.length === 0 ? (
        <EmptyState>Aucun utilisateur ne correspond à la recherche.</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {users.map((user) => (
            <li key={user.id} className="flex flex-col gap-3 p-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="font-medium">
                  {displayName(user)}
                  {user.id === actor.id ? <span className="text-muted-foreground font-normal"> (vous)</span> : null}
                </p>
                <p className="text-muted-foreground truncate text-sm">{user.email}</p>
                <p className="text-muted-foreground text-xs">
                  {user.lastLoginAt ? `Dernière connexion : ${formatDateTime(user.lastLoginAt)}` : "Jamais connecté"}
                </p>
              </div>
              <UserForm user={user} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
