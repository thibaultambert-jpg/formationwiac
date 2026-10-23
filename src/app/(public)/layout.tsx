import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { db } from "@/lib/db";

// Pages reached through personal links (no login): attendance and evaluations.
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const organization = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { name: true } });
  return (
    <>
      <header className="bg-primary px-4 py-4">
        <div className="bg-brand-lavender mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl px-5 py-3 shadow-lg shadow-black/10">
          <Logo className="text-primary h-9" />
          {organization?.name ? <p className="text-foreground/75 text-sm">{organization.name}</p> : null}
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter links={false} />
    </>
  );
}
