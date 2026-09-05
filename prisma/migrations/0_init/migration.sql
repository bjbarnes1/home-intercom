-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('ENDPOINT', 'CONTROLLER');

-- CreateEnum
CREATE TYPE "PairingState" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('RECURRING', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PAGE', 'CALL', 'BROADCAST', 'REMINDER');

-- CreateEnum
CREATE TYPE "EventOutcome" AS ENUM ('INITIATED', 'DELIVERED', 'MISSED', 'ENDED');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "room" TEXT,
    "type" "DeviceType" NOT NULL DEFAULT 'ENDPOINT',
    "pairing" "PairingState" NOT NULL DEFAULT 'PENDING',
    "hasMic" BOOLEAN NOT NULL DEFAULT true,
    "hasSpeaker" BOOLEAN NOT NULL DEFAULT true,
    "hasScreen" BOOLEAN NOT NULL DEFAULT true,
    "doNotDisturb" BOOLEAN NOT NULL DEFAULT false,
    "autoAnswer" BOOLEAN NOT NULL DEFAULT true,
    "pairingCode" TEXT,
    "deviceSecret" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "pushSubscription" JSONB,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneMembership" (
    "zoneId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "ZoneMembership_pkey" PRIMARY KEY ("zoneId","deviceId")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sound" TEXT,
    "kind" "ReminderKind" NOT NULL DEFAULT 'ONE_OFF',
    "cron" TEXT,
    "runAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "targetDeviceId" TEXT,
    "targetZoneId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercomEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "outcome" "EventOutcome" NOT NULL DEFAULT 'INITIATED',
    "roomName" TEXT,
    "initiatorUserId" TEXT,
    "targetDeviceId" TEXT,
    "targetZoneId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "IntercomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_householdId_idx" ON "User"("householdId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairingCode_key" ON "Device"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceSecret_key" ON "Device"("deviceSecret");

-- CreateIndex
CREATE INDEX "Device_householdId_idx" ON "Device"("householdId");

-- CreateIndex
CREATE INDEX "Device_householdId_pairing_idx" ON "Device"("householdId", "pairing");

-- CreateIndex
CREATE INDEX "Zone_householdId_idx" ON "Zone"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_householdId_name_key" ON "Zone"("householdId", "name");

-- CreateIndex
CREATE INDEX "ZoneMembership_deviceId_idx" ON "ZoneMembership"("deviceId");

-- CreateIndex
CREATE INDEX "Reminder_householdId_idx" ON "Reminder"("householdId");

-- CreateIndex
CREATE INDEX "Reminder_enabled_nextRunAt_idx" ON "Reminder"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "IntercomEvent_householdId_startedAt_idx" ON "IntercomEvent"("householdId", "startedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneMembership" ADD CONSTRAINT "ZoneMembership_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneMembership" ADD CONSTRAINT "ZoneMembership_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_targetZoneId_fkey" FOREIGN KEY ("targetZoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercomEvent" ADD CONSTRAINT "IntercomEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercomEvent" ADD CONSTRAINT "IntercomEvent_initiatorUserId_fkey" FOREIGN KEY ("initiatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercomEvent" ADD CONSTRAINT "IntercomEvent_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercomEvent" ADD CONSTRAINT "IntercomEvent_targetZoneId_fkey" FOREIGN KEY ("targetZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

