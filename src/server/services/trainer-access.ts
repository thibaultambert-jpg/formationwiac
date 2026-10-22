import "server-only";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/guards";
import { resolveToken } from "@/server/tokens";

export type TrainerAccess = { sessionId: string; trainerId: string; actorId: string | null; token: string | null };

/**
 * A trainer acts on a session either through their personal link (token) or
 * when signed in with the Google account linked to their trainer record.
 */
export async function resolveTrainerAccess(input: {
  token?: string | null;
  sessionId?: string | null;
}): Promise<TrainerAccess | null> {
  if (input.token) {
    const record = await resolveToken(input.token, ["trainer_attendance"]);
    if (!record?.sessionId || !record.trainerId) return null;
    return { sessionId: record.sessionId, trainerId: record.trainerId, actorId: null, token: input.token };
  }
  if (!input.sessionId) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const trainer = await db.trainer.findUnique({ where: { userId: user.id } });
  if (!trainer || !trainer.active) return null;
  const link = await db.sessionTrainer.findUnique({
    where: { sessionId_trainerId: { sessionId: input.sessionId, trainerId: trainer.id } },
  });
  return link ? { sessionId: input.sessionId, trainerId: trainer.id, actorId: user.id, token: null } : null;
}
