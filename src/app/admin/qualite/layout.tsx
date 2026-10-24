import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";

const QUALITY_TABS = [
  { href: "/admin/qualite/indicateurs", label: "Indicateurs" },
  { href: "/admin/qualite/reclamations", label: "Réclamations" },
  { href: "/admin/qualite/ameliorations", label: "Amélioration continue" },
];

export default function QualityLayout({ children }: LayoutProps<"/admin/qualite">) {
  return (
    <>
      <PageHeader
        title="Qualité"
        description="Indicateurs de résultats, registre des réclamations et des actions d'amélioration (Qualiopi)."
      />
      <TabNav items={QUALITY_TABS} label="Sections qualité" />
      {children}
    </>
  );
}
