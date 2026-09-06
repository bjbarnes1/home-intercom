import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { PLAYLIST, SOURCES, trackAt } from "@/lib/music/playlist";

export const dynamic = "force-dynamic";

/** Load or lazily create the household's music state. */
async function loadState(householdId: string) {
  return prisma.musicState.upsert({
    where: { householdId },
    update: {},
    create: { householdId, rooms: [] },
  });
}

async function serialize(householdId: string) {
  const state = await loadState(householdId);
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

export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }
  return NextResponse.json(await serialize(device.householdId));
}

const Action = z.object({
  action: z.enum(["play", "pause", "next", "prev", "source", "toggleRoom"]),
  deviceId: z.string().optional(),
  source: z.string().optional(),
});

export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device || device.pairing !== "ACTIVE") {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const state = await loadState(device.householdId);
  const { action } = parsed.data;

  const data: {
    isPlaying?: boolean;
    trackIndex?: number;
    source?: string;
    rooms?: string[];
  } = {};

  switch (action) {
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
      if (parsed.data.source && (SOURCES as readonly string[]).includes(parsed.data.source)) {
        data.source = parsed.data.source;
      }
      break;
    case "toggleRoom": {
      const id = parsed.data.deviceId;
      if (id) {
        data.rooms = state.rooms.includes(id)
          ? state.rooms.filter((r) => r !== id)
          : [...state.rooms, id];
      }
      break;
    }
  }

  await prisma.musicState.update({ where: { householdId: device.householdId }, data });
  return NextResponse.json(await serialize(device.householdId));
}
