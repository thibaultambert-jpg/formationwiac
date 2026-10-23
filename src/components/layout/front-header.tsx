import Link from "next/link";
import { NavLink } from "@/components/layout/nav-link";
import { UserMenu } from "@/components/layout/user-menu";
import type { CurrentUser } from "@/server/auth/guards";
import { hasRole } from "@/server/auth/policy";

const linkClassName =
  "rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-ring";
const activeClassName = "bg-accent font-medium";

export function FrontHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-lg font-semibold">
            Formations
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
