import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NavLink } from "@/components/layout/nav-link";
import { UserMenu } from "@/components/layout/user-menu";
import type { CurrentUser } from "@/server/auth/guards";
import { hasRole } from "@/server/auth/policy";

const linkClassName =
  "text-foreground hover:bg-white/60 inline-flex rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring";
// Active link: violet pill, as on wiacademy.fr.
const activeClassName = "bg-primary text-primary-foreground hover:bg-primary font-semibold";

/** Floating lavender navigation bar on the violet band (wiacademy.fr header). */
export function FrontHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="bg-primary px-4 pt-4">
      <div className="bg-brand-lavender mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl px-4 py-3 shadow-lg shadow-black/10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-primary focus-visible:ring-ring rounded-md outline-none focus-visible:ring-2"
            aria-label="Catalogue WiAcademy"
          >
            <Logo className="h-9" />
          </Link>
          <div className="sm:hidden">
            <UserMenu user={user} />
          </div>
        </div>
        <nav aria-label="Navigation principale" className="-mx-1 overflow-x-auto">
          <ul className="flex gap-1">
            <li>
              <NavLink href="/" exact className={linkClassName} activeClassName={activeClassName}>
                Catalogue
              </NavLink>
            </li>
            <li>
              <NavLink href="/mes-formations" className={linkClassName} activeClassName={activeClassName}>
                Mes formations
              </NavLink>
            </li>
            {hasRole(user.role, ["trainer", "admin"]) ? (
              <li>
                <NavLink href="/mes-sessions" className={linkClassName} activeClassName={activeClassName}>
                  Mes sessions
                </NavLink>
              </li>
            ) : null}
            {user.role === "admin" ? (
              <li>
                <NavLink href="/admin" className={linkClassName} activeClassName={activeClassName}>
                  Administration
                </NavLink>
              </li>
            ) : null}
          </ul>
        </nav>
        <div className="hidden sm:block">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
