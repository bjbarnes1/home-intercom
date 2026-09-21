import { describe, expect, it, vi } from "vitest";
import { Registry } from "./registry";
import type { PanelConnection } from "./registry";

/**
 * The registry is where presence stops being a stored value and becomes a fact
 * about a socket. That makes two things worth pinning: it never leaks across
 * households, and a reconnect does not leave a ghost receiving commands nobody
 * is listening to.
 */

const OPEN = 1;
const CLOSING = 2;

function fakeSocket(readyState = OPEN) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  };
}

function conn(
  householdId: string,
  deviceId: string,
  socket = fakeSocket(),
): PanelConnection {
  return {
    socket: socket as unknown as PanelConnection["socket"],
    householdId,
    deviceId,
    since: Date.now(),
  };
}

const reminder = { type: "reminder", text: "tea", reminderId: "r1" } as const;

describe("presence", () => {
  it("is the connection — no store, no window", () => {
    const r = new Registry();
    r.add(conn("hh_a", "dev_1"));

    expect(r.online("hh_a")).toEqual(["dev_1"]);
    expect(r.onlineAmong("hh_a", ["dev_1", "dev_2"])).toEqual(new Set(["dev_1"]));
  });

  it("ends the moment the socket closes", () => {
    const r = new Registry();
    const socket = fakeSocket();
    r.add(conn("hh_a", "dev_1", socket));
    r.remove("hh_a", "dev_1", socket as unknown as PanelConnection["socket"]);

    expect(r.online("hh_a")).toEqual([]);
    expect(r.stats().households).toBe(0);
  });

  it("never reports another household's panels", () => {
    const r = new Registry();
    r.add(conn("hh_a", "dev_1"));
    r.add(conn("hh_b", "dev_2"));

    expect(r.online("hh_a")).toEqual(["dev_1"]);
    // The same bug class as the shared LiveKit lobby, which is why it is here.
    expect(r.onlineAmong("hh_a", ["dev_2"])).toEqual(new Set());
    expect(r.online("hh_unknown")).toEqual([]);
  });
});

describe("reconnect", () => {
  it("closes the old socket rather than leaving a ghost", () => {
    const r = new Registry();
    const old = fakeSocket();
    const fresh = fakeSocket();

    r.add(conn("hh_a", "dev_1", old));
    r.add(conn("hh_a", "dev_1", fresh));

    expect(old.close).toHaveBeenCalled();
    expect(r.online("hh_a")).toEqual(["dev_1"]);

    // Commands go to the live socket only.
    r.send("hh_a", ["dev_1"], reminder);
    expect(fresh.send).toHaveBeenCalledTimes(1);
    expect(old.send).not.toHaveBeenCalled();
  });

  it("ignores a late close from the socket that was replaced", () => {
    const r = new Registry();
    const old = fakeSocket();
    const fresh = fakeSocket();
    r.add(conn("hh_a", "dev_1", old));
    r.add(conn("hh_a", "dev_1", fresh));

    // The old socket's close event arrives after the new one registered. It
    // must not evict the live connection.
    r.remove("hh_a", "dev_1", old as unknown as PanelConnection["socket"]);

    expect(r.online("hh_a")).toEqual(["dev_1"]);
  });
});

describe("fan-out", () => {
  it("reaches only the addressed devices, and reports who got it", () => {
    const r = new Registry();
    const one = fakeSocket();
    const two = fakeSocket();
    const three = fakeSocket();
    r.add(conn("hh_a", "dev_1", one));
    r.add(conn("hh_a", "dev_2", two));
    r.add(conn("hh_a", "dev_3", three));

    const reached = r.send("hh_a", ["dev_1", "dev_3"], reminder);

    expect(reached.sort()).toEqual(["dev_1", "dev_3"]);
    expect(two.send).not.toHaveBeenCalled();
  });

  it("does not deliver to a socket that is closing", () => {
    const r = new Registry();
    const closing = fakeSocket(CLOSING);
    r.add(conn("hh_a", "dev_1", closing));

    // "Reached" has to mean written to, because it is what the audit row
    // records as DELIVERED.
    expect(r.send("hh_a", ["dev_1"], reminder)).toEqual([]);
    expect(closing.send).not.toHaveBeenCalled();
  });

  it("cannot be addressed across households", () => {
    const r = new Registry();
    const mine = fakeSocket();
    const theirs = fakeSocket();
    r.add(conn("hh_a", "dev_1", mine));
    r.add(conn("hh_b", "dev_2", theirs));

    expect(r.send("hh_a", ["dev_2"], reminder)).toEqual([]);
    expect(theirs.send).not.toHaveBeenCalled();
  });

  it("sendAll covers exactly one household", () => {
    const r = new Registry();
    const a1 = fakeSocket();
    const a2 = fakeSocket();
    const b1 = fakeSocket();
    r.add(conn("hh_a", "dev_1", a1));
    r.add(conn("hh_a", "dev_2", a2));
    r.add(conn("hh_b", "dev_3", b1));

    expect(r.sendAll("hh_a", reminder).sort()).toEqual(["dev_1", "dev_2"]);
    expect(b1.send).not.toHaveBeenCalled();
  });

  it("is a no-op for a household with nobody connected", () => {
    const r = new Registry();
    expect(r.send("hh_empty", ["dev_1"], reminder)).toEqual([]);
    expect(r.sendAll("hh_empty", reminder)).toEqual([]);
  });
});

describe("bookkeeping", () => {
  it("forgets a household once its last panel goes", () => {
    const r = new Registry();
    const s1 = fakeSocket();
    const s2 = fakeSocket();
    r.add(conn("hh_a", "dev_1", s1));
    r.add(conn("hh_a", "dev_2", s2));

    r.remove("hh_a", "dev_1", s1 as unknown as PanelConnection["socket"]);
    expect(r.activeHouseholds()).toEqual(["hh_a"]);

    r.remove("hh_a", "dev_2", s2 as unknown as PanelConnection["socket"]);
    expect(r.activeHouseholds()).toEqual([]);
    expect(r.stats()).toEqual({ households: 0, connections: 0 });
  });
});
