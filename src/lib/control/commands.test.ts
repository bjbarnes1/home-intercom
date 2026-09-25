import { describe, expect, it } from "vitest";
import {
  ControlCommandSchema,
  decodeCommand,
  encodeCommand,
  type MusicControlCommand,
  type MusicFetchCommand,
  type MusicHandoffCommand,
  type MusicHandoffResultCommand,
} from "@/lib/control/commands";

const handoff: MusicHandoffCommand = {
  type: "musicHandoff",
  trackIds: ["1440857781", "1440857782"],
  startIndex: 1,
  startTime: 42.5,
  from: "Kitchen",
};

describe("musicHandoff over the control channel", () => {
  it("survives the round trip the lobby puts it through", () => {
    expect(decodeCommand(encodeCommand(handoff))).toEqual(handoff);
  });

  it("keeps the position, which is the whole point of a handoff", () => {
    const back = decodeCommand(encodeCommand(handoff)) as MusicHandoffCommand;
    expect(back.startIndex).toBe(1);
    expect(back.startTime).toBe(42.5);
  });

  it("needs at least one track — an empty handoff is not a handoff", () => {
    expect(ControlCommandSchema.safeParse({ ...handoff, trackIds: [] }).success).toBe(false);
  });

  it("refuses to carry a whole library in one message", () => {
    const tooMany = { ...handoff, trackIds: Array.from({ length: 101 }, (_, i) => `t${i}`) };
    expect(ControlCommandSchema.safeParse(tooMany).success).toBe(false);
    const atTheLimit = { ...handoff, trackIds: Array.from({ length: 100 }, (_, i) => `t${i}`) };
    expect(ControlCommandSchema.safeParse(atTheLimit).success).toBe(true);
  });

  it("rejects a position that is not a whole track", () => {
    expect(ControlCommandSchema.safeParse({ ...handoff, startIndex: 1.5 }).success).toBe(false);
    expect(ControlCommandSchema.safeParse({ ...handoff, startIndex: -1 }).success).toBe(false);
  });

  it("rejects a negative seek", () => {
    expect(ControlCommandSchema.safeParse({ ...handoff, startTime: -1 }).success).toBe(false);
  });

  it("works without a room name, which is only decoration", () => {
    const { from: _from, ...anonymous } = handoff;
    expect(ControlCommandSchema.safeParse(anonymous).success).toBe(true);
  });

  it("is told apart from every other command on the channel", () => {
    const parsed = decodeCommand(encodeCommand(handoff));
    expect(parsed.type).toBe("musicHandoff");
    expect(decodeCommand(encodeCommand({ type: "ping", at: 1 })).type).toBe("ping");
  });

  it("refuses a command that is not in the union at all", () => {
    expect(() => decodeCommand(new TextEncoder().encode('{"type":"eject"}'))).toThrow();
  });
});

describe("musicFetch — bringing the music to you", () => {
  const fetchCmd: MusicFetchCommand = {
    type: "musicFetch",
    toDeviceId: "dev_bedroom",
    from: "Bedroom",
  };

  it("survives the round trip", () => {
    expect(decodeCommand(encodeCommand(fetchCmd))).toEqual(fetchCmd);
  });

  it("names where the music should end up", () => {
    // The panel receiving this is the one holding the queue; without a
    // destination it has no idea who asked.
    expect(ControlCommandSchema.safeParse({ type: "musicFetch", from: "Bedroom" }).success).toBe(
      false,
    );
  });

  it("works without a room name, which is only for saying where it went", () => {
    const { from: _from, ...anonymous } = fetchCmd;
    expect(ControlCommandSchema.safeParse(anonymous).success).toBe(true);
  });

  it("is told apart from a handoff going the other way", () => {
    expect(decodeCommand(encodeCommand(fetchCmd)).type).toBe("musicFetch");
  });
});

describe("musicControl — working another room's player", () => {
  const control: MusicControlCommand = { type: "musicControl", action: "volume", value: 0.4 };

  it("survives the round trip", () => {
    expect(decodeCommand(encodeCommand(control))).toEqual(control);
  });

  it("carries transport without a value", () => {
    for (const action of ["play", "pause", "next", "previous"] as const) {
      expect(ControlCommandSchema.safeParse({ type: "musicControl", action }).success).toBe(true);
    }
  });

  it("keeps volume inside what a volume control means", () => {
    expect(ControlCommandSchema.safeParse({ ...control, value: 1.5 }).success).toBe(false);
    expect(ControlCommandSchema.safeParse({ ...control, value: -0.1 }).success).toBe(false);
    expect(ControlCommandSchema.safeParse({ ...control, value: 0 }).success).toBe(true);
    expect(ControlCommandSchema.safeParse({ ...control, value: 1 }).success).toBe(true);
  });

  it("refuses an action it has no way to perform", () => {
    expect(ControlCommandSchema.safeParse({ type: "musicControl", action: "eject" }).success).toBe(
      false,
    );
  });
});

describe("the answer to a handoff", () => {
  const result: MusicHandoffResultCommand = {
    type: "musicHandoffResult",
    handoffId: "3f2b9c1e-0000-4000-8000-000000000000",
    ok: false,
    error: "Nobody is signed in to Apple Music on that panel",
    to: "Kitchen",
  };

  it("survives the round trip the lobby puts it through", () => {
    expect(decodeCommand(encodeCommand(result))).toEqual(result);
  });

  it("carries the id and sender an acking panel needs, and an older handoff without them still parses", () => {
    const withAck = { ...handoff, handoffId: "abc12345", fromDeviceId: "dev_1" };
    expect(decodeCommand(encodeCommand(withAck))).toEqual(withAck);
    expect(ControlCommandSchema.safeParse(handoff).success).toBe(true);
  });
});

describe("shuffle and repeat travel with the queue", () => {
  it("carries them on a handoff, and an older handoff without them still parses", () => {
    const withModes = { ...handoff, shuffle: true, repeat: "all" as const };
    expect(decodeCommand(encodeCommand(withModes))).toEqual(withModes);
    expect(ControlCommandSchema.safeParse({ ...handoff, repeat: "sometimes" }).success).toBe(false);
  });

  it("lets another room press shuffle and repeat", () => {
    for (const action of ["shuffle", "repeat"] as const) {
      expect(ControlCommandSchema.safeParse({ type: "musicControl", action }).success).toBe(true);
    }
  });
});

describe("reminder commands over the control channel", () => {
  it("an actionable reminder carries its occurrence", () => {
    const cmd = {
      type: "reminder" as const,
      text: "Gus, take the bins out",
      reminderId: "rem_1",
      occurrenceId: "occ_1",
      title: "Take the bins out",
      assignee: "Gus",
      dueAt: "2026-09-29T09:30:00.000Z",
      late: false,
    };
    expect(decodeCommand(encodeCommand(cmd))).toEqual(cmd);
  });

  it("a reminder from an older server, with no occurrence, still parses", () => {
    const legacy = { type: "reminder" as const, text: "Bins", reminderId: "rem_1" };
    expect(decodeCommand(encodeCommand(legacy))).toEqual(legacy);
  });

  it("state changes and change notices round-trip", () => {
    const state = {
      type: "reminderState" as const,
      occurrenceId: "occ_1",
      reminderId: "rem_1",
      status: "SNOOZED" as const,
      snoozedUntil: "2026-09-29T09:45:00.000Z",
      by: "Kitchen",
    };
    expect(decodeCommand(encodeCommand(state))).toEqual(state);
    expect(decodeCommand(encodeCommand({ type: "remindersChanged", reason: "created" }))).toEqual({
      type: "remindersChanged",
      reason: "created",
    });
  });

  it("rejects a state the lifecycle does not have", () => {
    expect(
      ControlCommandSchema.safeParse({ type: "reminderState", occurrenceId: "o", reminderId: "r", status: "DONE" }).success,
    ).toBe(false);
  });
});
