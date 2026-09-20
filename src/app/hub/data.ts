/**
 * Hub prototype — fixture data.
 *
 * Every value here is invented so the FamOS Hub screens can be walked through on
 * real hardware before any of them are wired to Prisma, LiveKit or the weather
 * provider. Nothing in this file reads or writes anything; when a screen gets a
 * real data source, delete its slice here rather than leaving both.
 *
 * People and rooms use the household's own identity keys, so colours come from
 * `ident()` and stay consistent with the LED bars — see docs/handoff/colours.
 */

import type { Identity } from "@/lib/color/identity";

export interface Person {
  /** Identity key — drives colour via ident(). */
  key: Identity;
  name: string;
  initial: string;
  home: boolean;
  /** Shown beside the Out group when they are not in. */
  back?: string;
}

export const PEOPLE: Person[] = [
  { key: "Dad", name: "Dad", initial: "D", home: true },
  { key: "Mum", name: "Mum", initial: "M", home: false, back: "back 09:30" },
  { key: "Gus", name: "Gus", initial: "G", home: true },
  { key: "Georgette", name: "Georgette", initial: "G", home: true },
  { key: "Willoughby", name: "Willoughby", initial: "W", home: true },
  { key: "Raff", name: "Raff", initial: "R", home: false, back: "back after school" },
];

export const AT_HOME = PEOPLE.filter((p) => p.home);
export const OUT = PEOPLE.filter((p) => !p.home);

export const CLOCK = { time: "08:42", date: "Monday 24 October", greeting: "Good morning" };

/** A note someone left for the house. Undefined means the block is not rendered. */
export const HOUSE_NOTE:
  | { text: string; by: string; at: string }
  | undefined = { text: "Back by 6 — dinner's in the oven", by: "Mum", at: "08:10" };

export interface DayEntry {
  time: string;
  title: string;
  detail: string;
  /** Who it involves. Empty for a restricted entry. */
  who: Identity[];
  /** Personal to someone: keeps its slot on a public screen, loses its content. */
  restricted?: boolean;
}

export const TODAY: DayEntry[] = [
  { time: "09:15", title: "School drop-off", detail: "Year 6 main entrance", who: ["Dad", "Gus"] },
  { time: "12:30", title: "Personal event", detail: "Kept private on this screen", who: [], restricted: true },
  { time: "16:00", title: "Swimming club", detail: "Riverside pool", who: ["Mum", "Raff"] },
];

export const HOME_CARDS = {
  nextUp: { at: "18:00", title: "Week reset", detail: "Jobs and streaks roll over" },
  jobs: { left: 7, leader: "Willoughby" },
  reminder: { at: "19:20", title: "Bins go out tonight", detail: "Gus's room · weekdays" },
};

/** Loose Ends — the personal action queue. Never shown on a public screen. */
export interface LooseEnd {
  id: string;
  title: string;
  source: string;
  /** Where it came from: email, a family member (identity key), or the assistant. */
  origin: { kind: "email" } | { kind: "person"; who: Identity } | { kind: "ai" };
  action: string;
}

export const LOOSE_ENDS: LooseEnd[] = [
  {
    id: "gala",
    title: "Raff's swimming gala moved to Saturday 9:00",
    source: "Riverside Swim Club · 6m ago",
    origin: { kind: "email" },
    action: "Add",
  },
  {
    id: "sleepover",
    title: "Sleepover at Tommy's on Friday?",
    source: "Asked 20m ago",
    origin: { kind: "person", who: "Willoughby" },
    action: "Approve",
  },
  {
    id: "schoolrun",
    title: "Nobody's on the school run Thursday",
    source: "Family calendar · 1h ago",
    origin: { kind: "ai" },
    action: "Assign",
  },
];

export const ME = {
  name: "Dad",
  key: "Dad" as Identity,
  greeting: "Morning, Dad",
  date: "Monday 24 October",
  line: "School run at 09:15, then you're clear until 13:00.",
  next: { at: "10:30", title: "Weekly groceries", detail: "Delivery window" },
  jobs: { left: 2, title: "Sort recycling bins", detail: "Then pay for swimming club" },
  message: { from: "Mum" as Identity, at: "12m", text: "Running 5 mins late with the groceries…" },
};

export interface Conversation {
  id: string;
  name: string;
  preview: string;
  when: string;
  members: Identity[];
  unread?: boolean;
  pinned?: boolean;
  /** Prefix on the preview, e.g. a speaker's name in a group. */
  speaker?: string;
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: "family",
    name: "Family",
    speaker: "Mum",
    preview: "Running 5 mins late with the groceries…",
    when: "2m",
    members: ["Dad", "Mum", "Willoughby", "Raff"],
    unread: true,
    pinned: true,
  },
  { id: "mum", name: "Mum", preview: "Can you grab milk on the way back?", when: "12m", members: ["Mum"], unread: true },
  { id: "raff", name: "Raff", preview: "Did you find my PE kit?", when: "1h", members: ["Raff"] },
  { id: "gus", name: "Gus", preview: "Homework club moved to 14:00 today", when: "3h", members: ["Gus"] },
  { id: "kids", name: "Kids", speaker: "Raff", preview: "Race you home!", when: "Yesterday", members: ["Gus", "Georgette", "Willoughby", "Raff"] },
];

export const NOW_PLAYING = {
  track: "Golden Hour",
  artist: "JVKE · Weekend Chill",
  room: "Kitchen Hub",
  elapsed: "1:42",
  total: "3:56",
  progress: 42,
  volume: 65,
};

export const BROWSE = ["Focus", "Family Dinner", "Kids' Favourites", "Chill Evening", "Throwback"];

export const RECENT_TRACKS = [
  { title: "Sunroof", artist: "Nicky Youre", length: "2:49" },
  { title: "As It Was", artist: "Harry Styles", length: "2:47" },
  { title: "Sunflower", artist: "Post Malone, Swae Lee", length: "2:38" },
  { title: "Lovely Day", artist: "Bill Withers", length: "4:15" },
];

export const SPEAKERS: { name: string; where: string; playing?: boolean; key?: Identity }[] = [
  { name: "Hub", where: "Kitchen · Playing now", playing: true, key: "Kitchen" },
  { name: "Rumpus", where: "Available", key: "Rumpus" },
  { name: "Lounge", where: "Available", key: "Lounge" },
  { name: "Gus's room", where: "Available", key: "Gus" },
  { name: "Whole house", where: "All rooms synced", key: "Everyone" },
];

export const WEATHER = {
  place: "Sydney",
  context: "home · updated 08:40",
  saved: ["Sydney", "Brisbane", "Jindabyne"],
  temp: 12,
  feelsLike: 9,
  condition: "Light rain",
  feelsNote: "the wind is doing that",
  high: 14,
  low: 7,
  wind: "28 km/h",
  uv: "2 · Low",
  sunset: "18:04",
  driest: "11:00–14:00",
  warning: {
    level: "Yellow warning · Wind",
    detail: "10:00–18:00 · gusts to 60 km/h. Bring the bins in and drop the trampoline net.",
    source: "Bureau of Meteorology",
  },
  /** hour, temperature, chance of rain as a percentage. */
  hours: [
    { at: "08", temp: 12, rain: 55 },
    { at: "09", temp: 12, rain: 40 },
    { at: "10", temp: 13, rain: 25 },
    { at: "11", temp: 13, rain: 15 },
    { at: "12", temp: 14, rain: 10 },
    { at: "13", temp: 14, rain: 10 },
    { at: "14", temp: 14, rain: 20 },
    { at: "15", temp: 13, rain: 45 },
    { at: "16", temp: 13, rain: 70 },
    { at: "17", temp: 12, rain: 65 },
    { at: "18", temp: 11, rain: 40 },
  ],
  week: [
    { day: "Today", icon: "rain" as const, high: 14, low: 7, rain: 60 },
    { day: "Tue", icon: "cloud" as const, high: 15, low: 8, rain: 20 },
    { day: "Wed", icon: "sun" as const, high: 16, low: 9, rain: 10 },
    { day: "Thu", icon: "rain" as const, high: 13, low: 8, rain: 70 },
    { day: "Fri", icon: "wind" as const, high: 12, low: 6, rain: 30 },
    { day: "Sat", icon: "sun" as const, high: 11, low: 5, rain: 10 },
    { day: "Sun", icon: "cloud" as const, high: 13, low: 7, rain: 25 },
  ],
  /**
   * Dressed for it. Derived in the real build from apparent temperature (the 2001
   * wind-chill revision) plus rain probability and the person's own outings —
   * never from air temperature, which is the case this feature exists to fix.
   */
  dressed: [
    { who: "Dad" as Identity, advice: "Coat and proper shoes", why: "09:15 run is dry, the 16:00 pickup is not" },
    { who: "Gus" as Identity, advice: "Waterproof over the jumper", why: "wind makes 12° feel like 9°, no shorts today" },
    { who: "Raff" as Identity, advice: "Waterproof, and a towel", why: "swimming at 16:00, heaviest rain 15:00–17:00" },
  ],
};

export const BROADCAST = {
  from: "Mum" as Identity,
  text: "Dinner's ready in 10 — start tidying up!",
  countdown: 27,
};

export const CALL = {
  who: "Mum" as Identity,
  elapsed: "04:15",
  mode: "Two-way call",
};
