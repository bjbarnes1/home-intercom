import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { PrismaClient } from "@prisma/client";
import { Registry } from "./registry";
import type { ControlCommand } from "../../../src/lib/control/commands";

/**
 * The control plane, as a long-running process.
 *
 * Deliberately the whole thing in one process with no external state, because
 * that is the property being tested: the same binary has to run in the cloud
 * for many households AND on a Hub in one house, where there is no Redis, no
 * Vercel and possibly no internet. Anything that would only work in the cloud
 * does not belong in here.
 *
 * What it does NOT do, on purpose:
 *   - media. LiveKit stays. This is the control path, not the audio path.
 *   - own the schema. It reads the same Postgres the web app does.
 *   - replace anything yet. It runs beside production and is measured.
 */

const registry = new Registry();

/** What the handshake needs to know about a panel. */
export interface AuthedDevice {
  id: string;
  householdId: string;
  displayName: string;
}

/**
 * Resolve a device secret. Injectable for two reasons: the benchmark measures
 * connection cost without a database in the way, and a Hub deployment may one
 * day authenticate against local state rather than a shared Postgres.
 */
export type Authenticate = (secret: string) => Promise<AuthedDevice | null>;

/** Panels that connected but never said hello get dropped. */
const HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * Liveness at the TCP level.
 *
 * A socket can be dead without either end noticing — a panel unplugged, a NAT
 * that silently forgot the mapping. Without this, presence would be *more*
 * wrong than the polling it replaces, because a stale entry would never
 * expire. ws answers pings itself; a connection that misses two rounds is gone.
 */
const PING_INTERVAL_MS = 30_000;

interface Live extends WebSocket {
  isAlive?: boolean;
  deviceId?: string;
  householdId?: string;
}

/**
 * The real one: the same Postgres the web app uses.
 *
 * Note what this costs. ONE query, when a panel connects — not one per
 * heartbeat, because there are no heartbeats. A panel that stays up for a week
 * authenticates once.
 */
export function prismaAuth(prisma: PrismaClient): Authenticate {
  return async (secret) => {
    if (!secret) return null;
    const device = await prisma.device.findUnique({
      where: { deviceSecret: secret },
      select: { id: true, householdId: true, pairing: true, displayName: true },
    });
    if (!device || device.pairing !== "ACTIVE") return null;
    return { id: device.id, householdId: device.householdId, displayName: device.displayName };
  };
}

export interface ControlPlane {
  registry: Registry;
  close: () => Promise<void>;
  port: number;
}

export interface StartOptions {
  port?: number;
  authenticate: Authenticate;
  /** Called after each successful handshake. Used by the benchmark to count. */
  onAuthenticated?: () => void;
}

export async function start(opts: StartOptions): Promise<ControlPlane> {
  const { port = 0, authenticate, onAuthenticated } = opts;
  const http = createServer(handleHttp);
  const wss = new WebSocketServer({ server: http, path: "/panel" });

  wss.on("connection", (raw: WebSocket) => {
    const socket = raw as Live;
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    /*
     * The secret arrives in the first message rather than the URL. A query
     * string is a bearer credential in something that gets logged by every
     * proxy between here and the panel; a frame is not.
     */
    const handshake = setTimeout(() => {
      socket.close(4001, "no hello");
    }, HANDSHAKE_TIMEOUT_MS);

    socket.once("message", async (data) => {
      clearTimeout(handshake);
      let hello: { type?: string; secret?: string };
      try {
        hello = JSON.parse(String(data));
      } catch {
        socket.close(4002, "malformed hello");
        return;
      }
      if (hello.type !== "hello" || typeof hello.secret !== "string") {
        socket.close(4002, "expected hello");
        return;
      }

      const device = await authenticate(hello.secret);
      onAuthenticated?.();
      if (!device) {
        socket.close(4003, "unauthorized");
        return;
      }

      socket.deviceId = device.id;
      socket.householdId = device.householdId;
      registry.add({
        socket,
        deviceId: device.id,
        householdId: device.householdId,
        since: Date.now(),
      });

      // The panel learns its room here, once, rather than re-fetching it every
      // ten seconds on the chance that it changed. A change pushes.
      socket.send(
        JSON.stringify({ type: "welcome", deviceId: device.id, room: device.displayName }),
      );

      socket.on("close", () => {
        registry.remove(device.householdId, device.id, socket);
      });
    });

    socket.on("error", () => socket.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const raw of wss.clients) {
      const socket = raw as Live;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, PING_INTERVAL_MS);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  const bound = typeof address === "object" && address ? address.port : port;

  return {
    registry,
    port: bound,
    close: async () => {
      clearInterval(heartbeat);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

/**
 * A small HTTP surface so the Next app can ask this process things during the
 * spike — presence, and fan-out — without either side owning the other.
 *
 * In a finished version the web app would talk to this over an internal
 * address; for measurement it is enough that the calls are real.
 */
function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/health") {
    return json(res, 200, { ok: true, ...registry.stats() });
  }

  if (url.pathname === "/presence") {
    const householdId = url.searchParams.get("household") ?? "";
    return json(res, 200, { online: registry.online(householdId) });
  }

  if (url.pathname === "/send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { householdId, deviceIds, command } = JSON.parse(body) as {
          householdId: string;
          deviceIds?: string[];
          command: ControlCommand;
        };
        const reached = deviceIds
          ? registry.send(householdId, deviceIds, command)
          : registry.sendAll(householdId, command);
        json(res, 200, { reached });
      } catch {
        json(res, 400, { error: "bad request" });
      }
    });
    return;
  }

  json(res, 404, { error: "not found" });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
