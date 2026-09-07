export interface DeviceRow {
  id: string;
  displayName: string;
  room: string | null;
  type: "ENDPOINT" | "CONTROLLER";
  online: boolean;
}

export interface ZoneRow {
  id: string;
  name: string;
  deviceCount: number;
  onlineCount: number;
}

export interface ReminderRow {
  id: string;
  text: string;
  cron: string | null;
  runAt: string | null;
  enabled: boolean;
  nextRunAt: string | null;
}

export type Tab = "home" | "broadcast" | "reminders" | "household";

export function roomIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("kitchen")) return "ph-cooking-pot";
  if (n.includes("rumpus")) return "ph-game-controller";
  if (n.includes("lounge")) return "ph-armchair";
  return "ph-door";
}
