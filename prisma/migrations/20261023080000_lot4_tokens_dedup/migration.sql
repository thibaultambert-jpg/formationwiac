-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'trainer_attendance';

-- DropForeignKey
ALTER TABLE "access_tokens" DROP CONSTRAINT "access_tokens_enrollment_id_fkey";

-- AlterTable
ALTER TABLE "access_tokens" ADD COLUMN     "session_id" UUID,
ADD COLUMN     "trainer_id" UUID,
ALTER COLUMN "enrollment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "dedup_key" TEXT;

-- CreateIndex
CREATE INDEX "access_tokens_session_id_trainer_id_idx" ON "access_tokens"("session_id", "trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_dedup_key_key" ON "documents"("dedup_key");

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

