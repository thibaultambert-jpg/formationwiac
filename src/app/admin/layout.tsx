import Link from "next/link";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { requireRole } from "@/server/auth/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Server-side check against the database, on top of the proxy check.
  const user = await requireRole(["admin"]);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="bg-sidebar border-sidebar-border flex flex-col gap-4 border-b p-4 md:w-60 md:border-r md:border-b-0">
        <Link href="/admin" className="px-3 text-lg font-semibold">
          Back-office
        </Link>
        <AdminSidebar />
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mt-auto hidden px-3 text-sm underline-offset-4 hover:underline md:block"
        >
          Voir le site collaborateurs
        </Link>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b px-4 py-3">
          <UserMenu user={user} />
        </header>
        <main id="contenu" className="flex-1 px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
