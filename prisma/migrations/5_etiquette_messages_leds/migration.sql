-- AlterTable Device: etiquette + LED capability
ALTER TABLE "Device" ADD COLUMN "chimeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Device" ADD COLUMN "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN "quietHoursStart" INTEGER;
ALTER TABLE "Device" ADD COLUMN "quietHoursEnd" INTEGER;
ALTER TABLE "Device" ADD COLUMN "hasLeds" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable IntercomEvent: optional summary for Messages rail
ALTER TABLE "IntercomEvent" ADD COLUMN "summary" TEXT;
