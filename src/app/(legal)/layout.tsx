import Link from "next/link";
import { connection } from "next/server";
import { Logo } from "@/components/brand/logo";
import { FrontHeader } from "@/components/layout/front-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getCurrentUser } from "@/server/auth/guards";
import { privacyNoticeText } from "@/server/domain/legal";
import { legalOrganization } from "@/server/services/legal";

// Legal pages (F1-F3): public, but a signed-in user keeps the site navigation to get back to the catalogue.
export default async function LegalLayout({ children }: LayoutProps<"/">) {
  // Request time only: the settings and the user are read from the database (never at build time).
  await connection();
  const [organization, user] = await Promise.all([legalOrganization(), getCurrentUser()]);
  return (
    <>
      {user ? (
        <FrontHeader user={user} />
      ) : (
        <header className="bg-primary px-4 py-4">
          <div className="bg-brand-lavender mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl px-5 py-3 shadow-lg shadow-black/10">
            <Link
              href="/connexion"
              className="text-primary focus-visible:ring-ring rounded-md outline-none focus-visible:ring-2"
              aria-label="Connexion à WiAcademy"
            >
              <Logo className="h-9" />
            </Link>
            <Link href="/connexion" className="text-primary text-sm font-medium hover:underline">
              Se connecter
            </Link>
          </div>
        </header>
      )}
      <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter links={Boolean(user)} notice={privacyNoticeText(organization)} />
    </>
  );
}
