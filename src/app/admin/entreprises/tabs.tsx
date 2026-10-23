import { TabNav } from "@/components/layout/tab-nav";

export function CompaniesTabs() {
  return (
    <TabNav
      label="Entreprises et participants"
      items={[
        { href: "/admin/entreprises", label: "Entreprises", exact: true },
        { href: "/admin/entreprises/participants", label: "Tous les participants" },
      ]}
    />
  );
}
