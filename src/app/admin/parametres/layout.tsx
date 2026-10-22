import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";

const SETTINGS_TABS = [
  { href: "/admin/parametres/organisme", label: "Organisme" },
  { href: "/admin/parametres/themes", label: "Thèmes" },
  { href: "/admin/parametres/utilisateurs", label: "Utilisateurs et rôles" },
];

export default function SettingsLayout({ children }: LayoutProps<"/admin/parametres">) {
  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Modèles d'emails (lot 3), questionnaires d'évaluation et délais de rappel (lot 4) à venir."
      />
      <TabNav items={SETTINGS_TABS} label="Sections des paramètres" />
      {children}
    </>
  );
}
