-- CreateTable
CREATE TABLE "MusicState" (
    "householdId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Household',
    "trackIndex" INTEGER NOT NULL DEFAULT 0,
    "isPlaying" BOOLEAN NOT NULL DEFAULT false,
    "rooms" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicState_pkey" PRIMARY KEY ("householdId")
);

-- AddForeignKey
ALTER TABLE "MusicState" ADD CONSTRAINT "MusicState_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

