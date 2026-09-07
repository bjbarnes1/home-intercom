-- Per-device how long announce/reminder overlays stay on screen (seconds).
ALTER TABLE "Device" ADD COLUMN "announceDwellSec" INTEGER NOT NULL DEFAULT 30;
