-- Reminders & Notifications module.
--
-- Additive only: every existing reminder keeps working unchanged. Old rows get
-- status PENDING, no assignee and no recurrence, so the scheduler reads them
-- exactly as before (legacy cron / runAt).

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SNOOZED', 'COMPLETED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Reminder"
  ADD COLUMN "details" TEXT,
  ADD COLUMN "recurrence" JSONB,
  ADD COLUMN "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "assigneeUserId" TEXT,
  ADD COLUMN "assigneeKidId" TEXT;

-- A reminder is for one person at most. Prisma cannot express this; the
-- database holds the line so a buggy writer cannot assign it to two.
ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_single_assignee"
  CHECK ("assigneeUserId" IS NULL OR "assigneeKidId" IS NULL);

-- CreateTable
CREATE TABLE "ReminderOccurrence" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "firedAt" TIMESTAMP(3),
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "snoozedUntil" TIMESTAMP(3),
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedByDeviceId" TEXT,
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderOccurrence_reminderId_scheduledFor_key" ON "ReminderOccurrence"("reminderId", "scheduledFor");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_status_snoozedUntil_idx" ON "ReminderOccurrence"("status", "snoozedUntil");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_householdId_status_idx" ON "ReminderOccurrence"("householdId", "status");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assigneeKidId_fkey" FOREIGN KEY ("assigneeKidId") REFERENCES "Kid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
