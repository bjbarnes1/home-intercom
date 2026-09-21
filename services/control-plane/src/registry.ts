import type { WebSocket } from "ws";
import type { ControlCommand } from "../../../src/lib/control/commands";
import { encodeCommand } from "../../../src/lib/control/commands";

/**
 * Who is connected, per household.
 *
 * This is the whole argument for the spike in one file. Presence is not
 * something we store and expire — it IS the connection. A panel is online
 * because there is an open socket to it; it goes offline when that socket
 * closes, which the kernel tells us, immediately and for free.
 *
 * Compare what it replaced: an HTTP POST every ten seconds per panel, a write
 * to Postgres, a TTL'd key in Redis, and a twenty-second window during which
 * the answer was wrong. None of that exists here. There is no heartbeat, no
 * sweeper, no window, and no store.
 *
 * Fan-out is the same story. Sending a command was: ask LiveKit who is in the
 * lobby (a network round trip that listed the whole room), then publish a data
 * message. Here it is a map lookup and a write to the sockets we already hold.
 */

export interface PanelConnection {
  socket: WebSocket;
  deviceId: string;
  householdId: string;
  /** Wall-clock connect time, for the "up since" line in diagnostics. */
  since: number;
}

export class Registry {
  /** householdId -> deviceId -> connection. Two levels, so fan-out never scans. */
  private byHousehold = new Map<string, Map<string, PanelConnection>>();

  add(conn: PanelConnection): void {
    let household = this.byHousehold.get(conn.householdId);
    if (!household) {
      household = new Map();
      this.byHousehold.set(conn.householdId, household);
    }
    /*
     * One connection per device. A panel that reconnects before the old socket
     * is reaped — a flaky wifi drop, a reload — would otherwise leave a ghost
     * that receives commands nobody is listening to. Last one in wins, and the
     * previous socket is closed rather than orphaned.
     */
    const existing = household.get(conn.deviceId);
    if (existing && existing.socket !== conn.socket) {
      existing.socket.close(4000, "replaced by a newer connection");
    }
    household.set(conn.deviceId, conn);
  }

  remove(householdId: string, deviceId: string, socket: WebSocket): void {
    const household = this.byHousehold.get(householdId);
    if (!household) return;
    // Only if it is still OUR socket: a late close event from a replaced
    // connection must not evict the live one.
    if (household.get(deviceId)?.socket !== socket) return;
    household.delete(deviceId);
    if (household.size === 0) this.byHousehold.delete(householdId);
  }

  /** Which of these devices are connected. The presence query, with no store. */
  onlineAmong(householdId: string, deviceIds: string[]): Set<string> {
    const household = this.byHousehold.get(householdId);
    if (!household) return new Set();
    return new Set(deviceIds.filter((id) => household.has(id)));
  }

  /** Every connected device in a household. */
  online(householdId: string): string[] {
    return [...(this.byHousehold.get(householdId)?.keys() ?? [])];
  }

  /**
   * Deliver a command to specific devices in one household.
   *
   * Returns the ids actually written to, which is the same answer
   * `ControlSender.connected()` used to need a round trip to LiveKit for —
   * except it is now a byproduct of sending rather than a question asked
   * beforehand, so there is no window between asking and sending.
   */
  send(
    householdId: string,
    deviceIds: string[],
    command: ControlCommand,
  ): string[] {
    const household = this.byHousehold.get(householdId);
    if (!household) return [];
    const payload = encodeCommand(command);
    const reached: string[] = [];
    for (const id of deviceIds) {
      const conn = household.get(id);
      if (!conn) continue;
      // readyState 1 === OPEN. A socket mid-close is not a delivery.
      if (conn.socket.readyState !== 1) continue;
      conn.socket.send(payload);
      reached.push(id);
    }
    return reached;
  }

  /** Broadcast to a whole household — announcements addressed to everyone. */
  sendAll(householdId: string, command: ControlCommand): string[] {
    return this.send(householdId, this.online(householdId), command);
  }

  /** Households with at least one panel connected. The job loop's work list. */
  activeHouseholds(): string[] {
    return [...this.byHousehold.keys()];
  }

  stats(): { households: number; connections: number } {
    let connections = 0;
    for (const h of this.byHousehold.values()) connections += h.size;
    return { households: this.byHousehold.size, connections };
  }
}
