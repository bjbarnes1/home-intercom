-- A parent-set "clean only" switch per panel. Off by default, so every panel
-- carries on exactly as it did; only a household admin can turn it on or off.
ALTER TABLE "Device" ADD COLUMN "musicCleanOnly" BOOLEAN NOT NULL DEFAULT false;
