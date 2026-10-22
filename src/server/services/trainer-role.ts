import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { roleForTrainerLink } from "@/server/domain/trainer-role";

/** Re-evaluates the role of a user after their internal trainer record changed. */
export async function syncTrainerRole(userId: string | null | undefined, actorId: string): Promise<void> {
  if (!userId) return;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { trainer: { select: { type: true, active: true } } },
  });
  if (!user) return;

  const linked = user.trainer?.type === "internal" && user.trainer.active;
  const role = roleForTrainerLink(user.role, linked);
  if (role === user.role) return;

  await db.user.update({ where: { id: user.id }, data: { role } });
  await audit(db, {
    userId: actorId,
    action: "role_change",
    entity: "user",
    entityId: user.id,
    before: { role: user.role },
    after: { role, reason: linked ? "trainer_linked" : "trainer_unlinked" },
  });
}
