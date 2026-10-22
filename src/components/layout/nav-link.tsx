"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  /** When true, only the exact path is considered active. */
  exact?: boolean;
  /** Other paths for which the link is also active. */
  alsoActiveOn?: string[];
};

export function NavLink({ href, children, className, activeClassName, exact = false, alsoActiveOn }: NavLinkProps) {
  const pathname = usePathname();
  const isActive =
    (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)) ||
    (alsoActiveOn ?? []).includes(pathname);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(className, isActive && activeClassName)}
    >
      {children}
    </Link>
  );
}
