-- BLE room presence: a beacon marks a room, a fix says who is in it.

ALTER TABLE "User" ADD COLUMN "followMeMusic" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RoomBeacon" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomBeacon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoomBeacon_deviceId_key" ON "RoomBeacon"("deviceId");
CREATE INDEX "RoomBeacon_householdId_idx" ON "RoomBeacon"("householdId");
CREATE UNIQUE INDEX "RoomBeacon_householdId_uuid_major_minor_key"
    ON "RoomBeacon"("householdId", "uuid", "major", "minor");

ALTER TABLE "RoomBeacon" ADD CONSTRAINT "RoomBeacon_householdId_fkey"
    FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomBeacon" ADD CONSTRAINT "RoomBeacon_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One row per person: where they are now, not where they have been.
CREATE TABLE "RoomFix" (
    "userId" TEXT NOT NULL,
    "beaconId" TEXT,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomFix_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "RoomFix_beaconId_idx" ON "RoomFix"("beaconId");

ALTER TABLE "RoomFix" ADD CONSTRAINT "RoomFix_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomFix" ADD CONSTRAINT "RoomFix_beaconId_fkey"
    FOREIGN KEY ("beaconId") REFERENCES "RoomBeacon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
