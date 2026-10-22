import { PageHeader } from "@/components/layout/page-header";
import { TabNav } from "@/components/layout/tab-nav";

const SETTINGS_TABS = [
  { href: "/admin/parametres/organisme", label: "Organisme" },
  { href: "/admin/parametres/themes", label: "Thèmes" },
  { href: "/admin/parametres/emails", label: "Emails" },
  { href: "/admin/parametres/donnees", label: "Données personnelles" },
  { href: "/admin/parametres/utilisateurs", label: "Utilisateurs et rôles" },
];

export default function SettingsLayout({ children }: LayoutProps<"/admin/parametres">) {
  return (
    <>
      <PageHeader title="Paramètres" description="Questionnaires d'évaluation et délais de rappel à venir au lot 4." />
      <TabNav items={SETTINGS_TABS} label="Sections des paramètres" />
      {children}
    </>
  );
}
