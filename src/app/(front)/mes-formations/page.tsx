import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Mes formations" };

export default async function MyTrainingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Mes formations" description="Vos inscriptions à venir et vos formations passées." />
      <ComingSoon lot={3} />
    </>
  );
}
