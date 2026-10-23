import { NavLink } from "@/components/layout/nav-link";

export type TabItem = { href: string; label: string; exact?: boolean; alsoActiveOn?: string[] };

export function TabNav({ items, label }: { items: readonly TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 overflow-x-auto border-b">
      <ul className="flex gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              exact={item.exact}
              alsoActiveOn={item.alsoActiveOn}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mb-px inline-block border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2"
              activeClassName="border-primary text-foreground font-medium"
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
