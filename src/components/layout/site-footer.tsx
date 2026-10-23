import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteFooter({ links = true }: { links?: boolean }) {
  return (
    <footer className="bg-card border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between">
        <Logo className="text-primary h-10" />
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
      </div>
    </footer>
  );
}
