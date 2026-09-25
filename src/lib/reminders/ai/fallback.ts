import { emptySlots, PARTS_OF_DAY, WEEKDAYS, type Slots } from "./slots";

/**
 * The offline parser: plain-English reminder requests without a model.
 *
 * Why it exists: the hardware must keep working without the cloud or a
 * subscription, and "remind Gus to feed the dog at 5" should not need a
 * datacentre. It covers the common shapes (who, what, a day, a time, a simple
 * repeat) and fills the same slots the model does, so resolve.ts treats both
 * the same way. Anything it cannot place is simply left unset, and the
 * Creation Modal asks.
 *
 * It is also the path taken when the model is unreachable, slow, or returns
 * something that fails validation. A reminder is never blocked on AI.
 */

const DAY_RE = "(mon|tue|wed|thu|fri|sat|sun)[a-z]*";
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };

const NTH: Record<string, 1 | 2 | 3 | 4 | -1> = {
  "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4, last: -1,
};

type Wd = (typeof WEEKDAYS)[number];
const wd = (s: string) => s.slice(0, 3).toLowerCase() as Wd;

export function parseFallback(input: string): Slots {
  let text = ` ${input.trim().replace(/\s+/g, " ")} `;
  const slots = emptySlots("");
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  // ── Repeat ──
  let m: RegExpMatchArray | null;
  if ((m = take(/\b(?:every\s+day|daily|each\s+day)\b/i))) slots.repeat_kind = "daily";
  else if ((m = take(/\b(?:every\s+weekday|on\s+weekdays|weekdays)\b/i))) slots.repeat_kind = "weekdays";
  else if ((m = take(new RegExp(`\\b(?:on\\s+)?the\\s+(1st|first|2nd|second|3rd|third|4th|fourth|last)\\s+${DAY_RE}\\s+of\\s+(?:the|each|every)\\s+month\\b`, "i")))) {
    slots.repeat_kind = "monthly_nth";
    slots.repeat_nth = NTH[m[1].toLowerCase()];
    slots.repeat_weekdays = [wd(m[2])];
  } else if ((m = take(new RegExp(`\\b(?:every\\s+(other|second|2nd)|fortnightly(?:\\s+on)?)\\s+${DAY_RE}\\b`, "i")))) {
    slots.repeat_kind = "weekly";
    slots.repeat_interval = 2;
    slots.repeat_weekdays = [wd(m[2])];
  } else if ((m = take(new RegExp(`\\b(?:every|each)\\s+(${DAY_RE}(?:\\s*(?:,|and)\\s*${DAY_RE})*)s?\\b`, "i")))) {
    slots.repeat_kind = "weekly";
    slots.repeat_weekdays = [...m[1].matchAll(new RegExp(DAY_RE, "gi"))].map((x) => wd(x[0]));
  } else if ((m = take(/\b(?:every\s+month|monthly)\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i))) {
    slots.repeat_kind = "monthly_day";
    slots.repeat_month_day = parseInt(m[1], 10);
  } else if ((m = take(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(?:each|every)\s+month\b/i))) {
    slots.repeat_kind = "monthly_day";
    slots.repeat_month_day = parseInt(m[1], 10);
  }

  // ── Relative ──
  if ((m = take(/\bin\s+(\d+|an?|one|two|three|four|five|ten|fifteen|twenty|thirty)\s+(minute|min|hour|hr)s?\b/i))) {
    const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NUM_WORDS[m[1].toLowerCase()];
    slots.time_kind = "relative";
    slots.relative_minutes = /^h/i.test(m[2]) ? n * 60 : n;
  } else if ((m = take(/\bin\s+(\d+|a|one|two|three)\s+days?\b/i))) {
    slots.date_kind = "in_days";
    slots.in_days = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NUM_WORDS[m[1].toLowerCase()];
  }

  // ── Day ──
  if (slots.date_kind === "none") {
    if (take(/\btonight\b/i)) {
      slots.date_kind = "today";
      if (slots.time_kind === "none") {
        slots.time_kind = "part_of_day";
        slots.part_of_day = "night";
      }
    } else if (take(/\btomorrow\b/i)) slots.date_kind = "tomorrow";
    else if (take(/\btoday\b/i)) slots.date_kind = "today";
    else if ((m = take(new RegExp(`\\b(?:(next|this)\\s+|on\\s+)?${DAY_RE}\\b`, "i")))) {
      const day = m[0].match(new RegExp(DAY_RE, "i"))![0];
      if (slots.repeat_kind === "none") {
        slots.date_kind = "weekday";
        slots.weekday = wd(day);
        slots.weekday_which = m[1]?.toLowerCase() === "next" ? "next" : "this";
      } else if (!slots.repeat_weekdays.length) {
        slots.repeat_weekdays = [wd(day)];
      }
    }
  }

  // ── Time ──
  if (slots.time_kind === "none") {
    if ((m = take(/\b(?:at\s+)?(\d{1,2})(?::|\.)(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i)) || (m = take(/\bat\s+(\d{1,2})()\s*(am|pm|a\.m\.|p\.m\.)?\b/i)) || (m = take(/\b(\d{1,2})()\s*(am|pm)\b/i))) {
      let hour = parseInt(m[1], 10);
      const minute = m[2] ? parseInt(m[2], 10) : 0;
      const ap = m[3]?.toLowerCase().replace(/\./g, "");
      if (ap === "pm" && hour < 12) hour += 12;
      if (ap === "am" && hour === 12) hour = 0;
      if (hour <= 23 && minute <= 59) {
        slots.time_kind = "clock";
        slots.hour = hour;
        slots.minute = minute;
        slots.hour_ambiguous = !ap && hour >= 1 && hour <= 12;
      }
    } else if (take(/\b(?:at\s+)?noon\b/i)) {
      Object.assign(slots, { time_kind: "clock", hour: 12, minute: 0 });
    } else if ((m = take(/\b(?:in\s+the\s+|at\s+|this\s+)?(morning|midday|afternoon|evening|night|bedtime|dinner(?:\s*time)?|after\s+school)\b/i))) {
      const p = m[1].toLowerCase().replace(/\s+/g, "_").replace("dinner_time", "dinner").replace("dinnertime", "dinner");
      if ((PARTS_OF_DAY as readonly string[]).includes(p)) {
        slots.time_kind = "part_of_day";
        slots.part_of_day = p as Slots["part_of_day"];
      }
    }
  }

  // ── Who and what ──
  let rest = text.trim().replace(/\s+/g, " ");
  const who = rest.match(/^(?:please\s+)?(?:can you\s+)?(?:set\s+a\s+reminder\s+(?:for\s+)?)?remind\s+([A-Za-z'’]+)\s+(?:to|that|about)\s+/i);
  if (who) {
    slots.assignee = who[1];
    rest = rest.slice(who[0].length);
  } else {
    const forWho = rest.match(/\bfor\s+([A-Z][a-z'’]+)\s+(?:to\s+)?/);
    if (forWho) {
      slots.assignee = forWho[1];
      rest = rest.replace(forWho[0], " ");
    }
    rest = rest.replace(/^(?:please\s+)?(?:set\s+a\s+reminder\s+(?:to\s+)?|reminder\s*:?\s*(?:to\s+)?|remind\s+me\s+(?:to\s+)?)/i, "");
  }
  slots.title = rest.replace(/\s+(?:on|at|in|by)\s*$/i, "").replace(/^(?:to\s+)/i, "").trim() || input.trim();
  return slots;
}
