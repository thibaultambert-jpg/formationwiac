import { connection } from "next/server";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { privacyNoticeText } from "@/server/domain/legal";
import { legalOrganization } from "@/server/services/legal";

// Pages reached without login through personal links (attendance, evaluations). Legal pages are in (legal).
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  // Request time only: the settings are read from the database (never at build time).
  await connection();
  const organization = await legalOrganization();
  return (
    <>
      <header className="bg-primary px-4 py-4">
        <div className="bg-brand-lavender mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl px-5 py-3 shadow-lg shadow-black/10">
          <Logo className="text-primary h-9" />
          <p className="text-foreground/75 text-sm">{organization.name}</p>
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter links={false} notice={privacyNoticeText(organization)} />
    </>
  );
}
