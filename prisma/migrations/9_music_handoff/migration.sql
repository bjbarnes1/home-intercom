-- A panel can only be handed music if somebody has linked an Apple Music
-- account on it. The token itself never leaves that device; this records only
-- that one exists, so other panels know where a handoff can land.
ALTER TABLE "Device" ADD COLUMN "musicLinkedAt" TIMESTAMP(3);
