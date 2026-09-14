-- Location & presence: household places, reported fixes, place visits, and the
-- per-user sharing consent record. See docs/LOCATION.md.

CREATE TYPE "LocationShareMode" AS ENUM ('OFF', 'PLACES', 'LIVE');

CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 150,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "batteryPct" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'significant',
    "coarse" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlaceVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "PlaceVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationShare" (
    "userId" TEXT NOT NULL,
    "mode" "LocationShareMode" NOT NULL DEFAULT 'OFF',
    "liveUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocationShare_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "Place_householdId_idx" ON "Place"("householdId");
CREATE INDEX "LocationPing_userId_capturedAt_idx" ON "LocationPing"("userId", "capturedAt");
-- Retention sweeps scan by age across all users.
CREATE INDEX "LocationPing_capturedAt_idx" ON "LocationPing"("capturedAt");
CREATE INDEX "PlaceVisit_userId_arrivedAt_idx" ON "PlaceVisit"("userId", "arrivedAt");
-- Finding the open visit to close on departure.
CREATE INDEX "PlaceVisit_placeId_leftAt_idx" ON "PlaceVisit"("placeId", "leftAt");

ALTER TABLE "Place" ADD CONSTRAINT "Place_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceVisit" ADD CONSTRAINT "PlaceVisit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaceVisit" ADD CONSTRAINT "PlaceVisit_placeId_fkey"
    FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationShare" ADD CONSTRAINT "LocationShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
