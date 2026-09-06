import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import { env } from "@/lib/env";
import { LOBBY_ROOM } from "@/lib/livekit/rooms";
import { encodeCommand, type ControlCommand } from "@/lib/control/commands";

/**
 * Delivers control commands to endpoints. In real mode it publishes a LiveKit
 * data message into the lobby room addressed to specific participants (device
 * ids). In MOCK_LOCAL_SERVICES mode it records the sends so the app and tests
 * run with no LiveKit server.
 */

export interface ControlSender {
  send(deviceIds: string[], command: ControlCommand): Promise<void>;
}

class MockControlSender implements ControlSender {
  public readonly sent: { deviceIds: string[]; command: ControlCommand }[] = [];
  async send(deviceIds: string[], command: ControlCommand): Promise<void> {
    this.sent.push({ deviceIds, command });
    // eslint-disable-next-line no-console
    console.info(`[mock control] -> ${deviceIds.join(", ")}: ${command.type}`);
  }
}

class LiveKitControlSender implements ControlSender {
  private client: RoomServiceClient;
  constructor() {
    // RoomServiceClient wants an http(s) URL, not ws(s).
    const httpUrl = env.livekit.url.replace(/^ws/, "http");
    this.client = new RoomServiceClient(
      httpUrl,
      env.livekit.apiKey,
      env.livekit.apiSecret,
    );
  }
  async send(deviceIds: string[], command: ControlCommand): Promise<void> {
    await this.client.sendData(
      LOBBY_ROOM,
      encodeCommand(command),
      DataPacket_Kind.RELIABLE,
      { destinationIdentities: deviceIds },
    );
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

/** Test/helper accessor for the mock's recorded sends. */
export function mockControlSender(): MockControlSender {
  const s = controlSender();
  if (!(s instanceof MockControlSender)) {
    throw new Error("controlSender is not the mock; set MOCK_LOCAL_SERVICES");
  }
  return s;
}
