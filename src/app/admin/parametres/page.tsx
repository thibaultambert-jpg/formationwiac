import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/guards";

export default async function SettingsIndexPage() {
  await requireRole(["admin"]);
  redirect("/admin/parametres/organisme");
}
