-- Geofence -> announcement rules. "When Willoughby arrives Home, say
-- 'Willoughby's home' in the Kitchen." See docs/LOCATION.md.

CREATE TYPE "PlaceTrigger" AS ENUM ('ARRIVE', 'DEPART');

CREATE TABLE "PlaceRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "trigger" "PlaceTrigger" NOT NULL,
    "subjectUserId" TEXT,
    "template" TEXT NOT NULL,
    "targetDeviceId" TEXT,
    "targetZoneId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlaceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaceRuleFire" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlaceRuleFire_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlaceRule_householdId_idx" ON "PlaceRule"("householdId");
-- The lookup the ping route does on every geofence crossing.
CREATE INDEX "PlaceRule_placeId_trigger_enabled_idx" ON "PlaceRule"("placeId", "trigger", "enabled");
-- One cooldown row per rule per person, overwritten each fire.
CREATE UNIQUE INDEX "PlaceRuleFire_ruleId_userId_key" ON "PlaceRuleFire"("ruleId", "userId");

ALTER TABLE "PlaceRule" ADD CONSTRAINT "PlaceRule_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceRule" ADD CONSTRAINT "PlaceRule_placeId_fkey"
    FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceRule" ADD CONSTRAINT "PlaceRule_subjectUserId_fkey"
    FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceRule" ADD CONSTRAINT "PlaceRule_targetDeviceId_fkey"
    FOREIGN KEY ("targetDeviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceRule" ADD CONSTRAINT "PlaceRule_targetZoneId_fkey"
    FOREIGN KEY ("targetZoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceRuleFire" ADD CONSTRAINT "PlaceRuleFire_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "PlaceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceRuleFire" ADD CONSTRAINT "PlaceRuleFire_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
