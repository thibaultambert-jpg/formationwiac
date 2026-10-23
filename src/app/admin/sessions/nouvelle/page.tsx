import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";
import { createSession } from "../actions";
import { sessionFormOptions } from "../form-data";
import { SessionForm } from "../session-form";

export const metadata: Metadata = { title: "Nouvelle session" };

export default async function NewSessionPage({ searchParams }: PageProps<"/admin/sessions/nouvelle">) {
  await requireRole(["admin"]);
  const { formation } = await searchParams;
  const options = await sessionFormOptions();

  return (
    <>
      <PageHeader
        title="Nouvelle session"
        description="La référence est attribuée automatiquement. La session est créée en brouillon."
      />
      <SessionForm
        action={createSession}
        defaultTrainingId={typeof formation === "string" ? formation : undefined}
        trainings={options.trainings}
        trainers={options.trainers}
      />
    </>
  );
}
