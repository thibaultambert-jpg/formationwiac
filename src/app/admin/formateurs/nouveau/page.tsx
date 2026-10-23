import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";
import { createTrainer } from "../actions";
import { TrainerForm } from "../trainer-form";

export const metadata: Metadata = { title: "Nouveau formateur" };

export default async function NewTrainerPage() {
  await requireRole(["admin"]);
  return (
    <>
      <PageHeader title="Nouveau formateur" />
      <TrainerForm action={createTrainer} />
    </>
  );
}
