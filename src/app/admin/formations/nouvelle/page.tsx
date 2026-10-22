import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { createTraining } from "../actions";
import { TrainingForm } from "../training-form";

export const metadata: Metadata = { title: "Nouvelle formation" };

export default async function NewTrainingPage() {
  await requireRole(["admin"]);
  const themes = await db.theme.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader title="Nouvelle formation" />
      <TrainingForm action={createTraining} themes={themes} />
    </>
  );
}
