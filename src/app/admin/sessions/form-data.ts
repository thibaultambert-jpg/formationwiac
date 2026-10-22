import "server-only";
import { db } from "@/lib/db";
import { TRAINER_TYPE_LABELS } from "@/lib/labels";

/** Options of the session form; inactive records already attached stay selectable. */
export async function sessionFormOptions(current?: { trainingId: string; trainerIds: string[] }) {
  const [trainings, trainers] = await Promise.all([
    db.training.findMany({
      where: { OR: [{ active: true }, ...(current ? [{ id: current.trainingId }] : [])] },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    db.trainer.findMany({
      where: { OR: [{ active: true }, ...(current ? [{ id: { in: current.trainerIds } }] : [])] },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return {
    trainings,
    trainers: trainers.map((trainer) => ({
      id: trainer.id,
      name: `${trainer.firstName} ${trainer.lastName}`,
      type:
        TRAINER_TYPE_LABELS[trainer.type] +
        (trainer.specialties.length ? ` · ${trainer.specialties.slice(0, 2).join(", ")}` : ""),
    })),
  };
}
