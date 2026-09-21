-- What each panel is playing, so "Playing on" can say so. Title and artist
-- only, with a timestamp: a reading nobody has refreshed is stale, not current.
ALTER TABLE "Device" ADD COLUMN "nowPlayingTitle" TEXT;
ALTER TABLE "Device" ADD COLUMN "nowPlayingArtist" TEXT;
ALTER TABLE "Device" ADD COLUMN "nowPlayingAt" TIMESTAMP(3);
