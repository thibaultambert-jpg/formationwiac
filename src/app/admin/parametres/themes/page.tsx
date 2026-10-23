import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { deleteTheme, toggleTheme } from "./actions";
import { CreateThemeForm, EditThemeForm } from "./theme-forms";

export const metadata: Metadata = { title: "Thèmes" };

export default async function ThemesPage() {
  await requireRole(["admin"]);
  const themes = await db.theme.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { _count: { select: { trainings: true } } },
  });

  return (
    <section aria-labelledby="themes-title" className="space-y-6">
      <div className="space-y-1">
        <h2 id="themes-title" className="text-lg font-semibold">
          Thèmes des formations
        </h2>
        <p className="text-muted-foreground text-sm">
          Les thèmes servent à classer les formations et à filtrer le catalogue des collaborateurs.
        </p>
      </div>

      <CreateThemeForm />

      {themes.length === 0 ? (
        <EmptyState>Aucun thème pour le moment.</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {themes.map((theme) => (
            <li key={theme.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
              <div className="flex-1">
                <EditThemeForm theme={theme} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={theme.active ? "success" : "secondary"}>{theme.active ? "Actif" : "Inactif"}</Badge>
                <span className="text-muted-foreground text-sm">
                  {theme._count.trainings} formation{theme._count.trainings > 1 ? "s" : ""}
                </span>
                <form action={toggleTheme}>
                  <input type="hidden" name="id" value={theme.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    {theme.active ? "Désactiver" : "Réactiver"}
                  </Button>
                </form>
                {theme._count.trainings === 0 ? (
                  <form action={deleteTheme}>
                    <input type="hidden" name="id" value={theme.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                      Supprimer
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
