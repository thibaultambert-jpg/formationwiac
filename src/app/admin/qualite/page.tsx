import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/guards";

export default async function QualityPage() {
  await requireRole(["admin"]);
  redirect("/admin/qualite/indicateurs");
}
