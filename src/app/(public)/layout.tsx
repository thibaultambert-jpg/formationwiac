import { db } from "@/lib/db";

// Pages reached through personal links (no login): attendance and evaluations.
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const organization = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { name: true } });
  return (
    <>
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-4 py-3 text-lg font-semibold">{organization?.name ?? "Formations"}</div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
