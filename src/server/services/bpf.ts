import "server-only";
import { db } from "@/lib/db";
import { parisMonthBounds } from "@/lib/dates";
import { signedHours, slotAttendance } from "@/server/domain/attendance-proof";
import type { BpfEnrollment } from "@/server/domain/bpf";

export type BpfRow = BpfEnrollment & {
  enrollmentId: string;
  session: string;
  training: string;
  participant: string;
  company: string | null;
  firstSlot: Date;
};

/**
 * Enrollments of a civil year (Paris time) for the BPF (B7): hours signed on
 * the slots of that year; the price is counted in the year of the first slot.
 */
export async function bpfRows(year: number): Promise<BpfRow[]> {
  const start = parisMonthBounds(year, 1).start;
  const end = parisMonthBounds(year + 1, 1).start;
  const enrollments = await db.enrollment.findMany({
    where: {
      status: { in: ["confirmed", "present", "absent", "dropped_out"] },
      session: { status: { not: "cancelled" }, slots: { some: { startsAt: { gte: start, lt: end } } } },
    },
    include: {
      participant: { include: { company: { select: { name: true } } } },
      attendances: true,
      corrections: true,
      session: {
        include: {
          training: { select: { title: true } },
          slots: { orderBy: { startsAt: "asc" } },
          trainers: { select: { trainer: { select: { type: true } } } },
        },
      },
    },
  });
  return enrollments.map((enrollment) => {
    const { slots } = enrollment.session;
    const inYear = slots.filter((slot) => slot.startsAt >= start && slot.startsAt < end);
    const hours = signedHours(
      inYear.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        attendance: slotAttendance({
          attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
          corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
        }),
      })),
    );
    const firstInYear = slots[0].startsAt >= start && slots[0].startsAt < end;
    return {
      enrollmentId: enrollment.id,
      participantType: enrollment.participantType,
      fundingType: enrollment.fundingType,
      hours,
      revenue: firstInYear && enrollment.appliedPrice ? Number(enrollment.appliedPrice) : 0,
      subcontracted: enrollment.session.trainers.some((link) => link.trainer.type === "external"),
      session: enrollment.session.reference,
      training: enrollment.session.training.title,
      participant: `${enrollment.participant.firstName} ${enrollment.participant.lastName}`,
      company: enrollment.participant.company?.name ?? null,
      firstSlot: slots[0].startsAt,
    };
  });
}
