export type Phase = "loading" | "unpaired" | "ready" | "error";
export type Rail =
  | "home"
  | "messages"
  | "schedule"
  | "jobs"
  | "reminders"
  | "sound";

export interface Incoming {
  title: string;
  mode: string;
}

export interface RingOffer {
  url: string;
  token: string;
  mode: string;
  title: string;
  eventId: string;
}

export interface EndpointReminder {
  id: string;
  text: string;
  sound: string | null;
  cron: string | null;
  runAt: string | null;
  nextRunAt: string | null;
}

export interface JobChore {
  id: string;
  label: string;
  done: boolean;
}
export interface JobKid {
  id: string;
  name: string;
  initial: string;
  total: number;
  doneToday: number;
  streak: number;
  chores: JobChore[];
}
export interface JobBoard {
  weekDoneTotal: number;
  kids: JobKid[];
}

export interface SchedEvent {
  id: string;
  title: string;
  time: string;
  who: string | null;
  color: string;
}
export interface SchedDay {
  day: string;
  weekday: string;
  dayNum: number;
  count: number;
  events: SchedEvent[];
}
export interface Schedule {
  days: SchedDay[];
  nextEvent: { title: string; time: string; who: string | null; day: string } | null;
}

export interface MusicState {
  source: string;
  isPlaying: boolean;
  rooms: string[];
  track: { index: number; total: number; title: string; artist: string; durationSec: number };
  availableRooms: { id: string; displayName: string }[];
}

export interface Speaking {
  text: string;
  label: string;
  audioUrl?: string | null;
}
