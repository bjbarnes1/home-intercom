import { z } from "zod";
import { SOURCES } from "@/lib/music/playlist";

/** Shared music control contract (API + wall-panel client). */
export const MusicActionSchema = z.object({
  action: z.enum(["play", "pause", "next", "prev", "source", "toggleRoom"]),
  deviceId: z.string().optional(),
  source: z.enum(SOURCES).optional(),
});

export type MusicAction = z.infer<typeof MusicActionSchema>["action"];

export type MusicActionRequest = z.infer<typeof MusicActionSchema>;
