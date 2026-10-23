import { FrontHeader } from "@/components/layout/front-header";
import { requireUser } from "@/server/auth/guards";

export default async function FrontLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <>
      <FrontHeader user={user} />
      <main id="contenu" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
