import { Building2, CalendarDays, GraduationCap, LayoutDashboard, Settings, UserRound } from "lucide-react";
import { NavLink } from "@/components/layout/nav-link";

const ADMIN_NAV = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/admin/formations", label: "Formations", icon: GraduationCap },
  { href: "/admin/sessions", label: "Sessions", icon: CalendarDays },
  { href: "/admin/formateurs", label: "Formateurs", icon: UserRound },
  { href: "/admin/entreprises", label: "Entreprises", icon: Building2 },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
] as const;

export function AdminSidebar() {
  return (
    <nav aria-label="Navigation du back-office">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {ADMIN_NAV.map(({ href, label, icon: Icon, ...rest }) => (
          <li key={href}>
            <NavLink
              href={href}
              exact={"exact" in rest}
              className="text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-ring flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2"
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
