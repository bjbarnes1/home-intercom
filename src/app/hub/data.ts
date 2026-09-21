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
