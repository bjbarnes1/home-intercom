import { prisma } from "@/lib/prisma";
import { PLAYLIST, SOURCES, trackAt } from "@/lib/music/playlist";
import type { MusicActionRequest } from "@/lib/music/actions";

export async function loadMusicState(householdId: string) {
  return prisma.musicState.upsert({
    where: { householdId },
    update: {},
    create: { householdId, rooms: [] },
  });
}

export async function serializeMusic(householdId: string) {
  const state = await loadMusicState(householdId);
  const track = trackAt(state.trackIndex);
  const endpoints = await prisma.device.findMany({
    where: { householdId, type: "ENDPOINT", pairing: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  return {
    source: state.source,
    isPlaying: state.isPlaying,
    rooms: state.rooms,
    track: {
      index: state.trackIndex % PLAYLIST.length,
      total: PLAYLIST.length,
      title: track.title,
      artist: track.artist,
      durationSec: track.durationSec,
    },
    availableRooms: endpoints,
  };
}

export async function applyMusicAction(
  householdId: string,
  action: MusicActionRequest,
) {
  const state = await loadMusicState(householdId);
  const data: {
    isPlaying?: boolean;
    trackIndex?: number;
    source?: string;
    rooms?: string[];
  } = {};

  switch (action.action) {
    case "play":
      data.isPlaying = true;
      break;
    case "pause":
      data.isPlaying = false;
      break;
    case "next":
      data.trackIndex = (state.trackIndex + 1) % PLAYLIST.length;
      break;
    case "prev":
      data.trackIndex = (state.trackIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
      break;
    case "source":
      if (action.source && (SOURCES as readonly string[]).includes(action.source)) {
        data.source = action.source;
      }
      break;
    case "toggleRoom": {
      const id = action.deviceId;
      if (id) {
        data.rooms = state.rooms.includes(id)
          ? state.rooms.filter((r) => r !== id)
          : [...state.rooms, id];
      }
      break;
    }
    default: {
      const _exhaustive: never = action.action;
      throw new Error(`Unknown action: ${_exhaustive}`);
    }
  }

  await prisma.musicState.update({ where: { householdId }, data });
  return serializeMusic(householdId);
}
