import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Catalogue" };

export default async function CatalogPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Catalogue des formations"
        description="Découvrez les formations ouvertes aux collaborateurs."
      />
      <ComingSoon lot={3} />
    </>
  );
}
