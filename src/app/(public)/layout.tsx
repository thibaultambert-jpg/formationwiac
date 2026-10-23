import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { db } from "@/lib/db";

// Pages reached through personal links (no login): attendance and evaluations.
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const organization = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { name: true } });
  return (
    <>
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Logo className="text-primary h-9" />
          {organization?.name ? <p className="text-muted-foreground text-sm">{organization.name}</p> : null}
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
