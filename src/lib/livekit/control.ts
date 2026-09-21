import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import { assertLiveKitConfigured, env } from "@/lib/env";
import { lobbyRoom } from "@/lib/livekit/rooms";
import { encodeCommand, type ControlCommand } from "@/lib/control/commands";

/**
 * Delivers control commands to endpoints. In real mode it publishes a LiveKit
 * data message into the lobby room addressed to specific participants (device
 * ids). In MOCK_LOCAL_SERVICES mode it records the sends so the app and tests
 * run with no LiveKit server.
 */

export interface ControlSender {
  send(householdId: string, deviceIds: string[], command: ControlCommand): Promise<void>;
  /** Of the given device ids, which are connected to that household's lobby. */
  connected(householdId: string, deviceIds: string[]): Promise<string[]>;
}

class MockControlSender implements ControlSender {
  public readonly sent: {
    householdId: string;
    deviceIds: string[];
    command: ControlCommand;
  }[] = [];
  async send(
    householdId: string,
    deviceIds: string[],
    command: ControlCommand,
  ): Promise<void> {
    this.sent.push({ householdId, deviceIds, command });
    // eslint-disable-next-line no-console
    console.info(`[mock control] -> ${deviceIds.join(", ")}: ${command.type}`);
  }
  async connected(_householdId: string, deviceIds: string[]): Promise<string[]> {
    // In mock mode there is no real lobby; treat all as reachable.
    return deviceIds;
  }
}

class LiveKitControlSender implements ControlSender {
  private client: RoomServiceClient;
  constructor() {
    assertLiveKitConfigured();
    // RoomServiceClient wants an http(s) URL, not ws(s).
    const httpUrl = env.livekit.url.replace(/^ws/, "http");
    this.client = new RoomServiceClient(
      httpUrl,
      env.livekit.apiKey,
      env.livekit.apiSecret,
    );
  }
  async send(
    householdId: string,
    deviceIds: string[],
    command: ControlCommand,
  ): Promise<void> {
    await this.client.sendData(
      lobbyRoom(householdId),
      encodeCommand(command),
      DataPacket_Kind.RELIABLE,
      { destinationIdentities: deviceIds },
    );
  }

  async connected(householdId: string, deviceIds: string[]): Promise<string[]> {
    if (deviceIds.length === 0) return [];
    try {
      const participants = await this.client.listParticipants(lobbyRoom(householdId));
      const present = new Set(participants.map((p) => p.identity));
      return deviceIds.filter((id) => present.has(id));
    } catch {
      // Room doesn't exist yet → nobody connected.
      return [];
    }
  }
}

let singleton: ControlSender | null = null;

export function controlSender(): ControlSender {
  if (singleton) return singleton;
  singleton = env.mockLocalServices
    ? new MockControlSender()
    : new LiveKitControlSender();
  return singleton;
}
