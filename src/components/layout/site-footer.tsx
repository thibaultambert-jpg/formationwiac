import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const LEGAL_LINKS = [
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/reglement-interieur", label: "Règlement intérieur" },
];

/** Footer of the front and public pages: legal links (F1-F3) and, on public pages, the short GDPR notice (E2, C8). */
export function SiteFooter({ links = true, notice }: { links?: boolean; notice?: string }) {
  return (
    <footer className="bg-card border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <Logo className="text-primary h-10" />
        <div className="flex flex-col gap-8 sm:flex-row sm:gap-16">
          {links ? (
            <nav aria-label="Liens du pied de page">
              <p className="text-primary mb-3 font-semibold">Mon espace</p>
              <ul className="text-foreground/80 space-y-2 text-sm">
                <li>
                  <Link href="/" className="hover:text-primary">
                    Catalogue des formations
                  </Link>
                </li>
                <li>
                  <Link href="/mes-formations" className="hover:text-primary">
                    Mes formations
                  </Link>
                </li>
              </ul>
            </nav>
          ) : null}
          <nav aria-label="Informations légales">
            <p className="text-primary mb-3 font-semibold">Informations</p>
            <ul className="text-foreground/80 space-y-2 text-sm">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      {notice ? (
        <div className="mx-auto max-w-6xl px-4 pb-8">
          <p className="text-muted-foreground max-w-3xl text-xs leading-relaxed">{notice}</p>
        </div>
      ) : null}
    </footer>
  );
}
