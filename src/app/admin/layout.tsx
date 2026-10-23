import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { requireRole } from "@/server/auth/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Server-side check against the database, on top of the proxy check.
  const user = await requireRole(["admin"]);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col gap-4 border-b p-4 md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0">
        <Link
          href="/admin"
          aria-label="Back-office WiAcademy"
          className="flex flex-col gap-1 rounded-md px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Logo className="h-9 self-start" />
          <span className="text-brand-teal text-xs font-semibold tracking-[0.2em] uppercase">Back-office</span>
        </Link>
        <AdminSidebar />
        <Link
          href="/"
          className="mt-auto hidden rounded-md px-3 text-sm text-white/75 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white md:block"
        >
          Voir le site collaborateurs
        </Link>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="bg-card flex items-center justify-end border-b px-4 py-3">
          <UserMenu user={user} />
        </header>
        <main id="contenu" className="flex-1 px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
