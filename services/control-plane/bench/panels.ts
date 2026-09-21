import WebSocket from "ws";
import { start } from "../src/server";
import type { AuthedDevice } from "../src/server";

/**
 * What does a connection-held control plane actually cost?
 *
 * The polling architecture's cost is arithmetic and needs no benchmark:
 * 6 beats/min/panel, times however many queries the handler does. The
 * connection architecture's cost is not arithmetic — it is "can one process
 * hold N sockets, in how much memory, and does fan-out stay fast as N grows".
 * That has to be measured.
 *
 * Panels are simulated in the same process as the server, so the numbers
 * include BOTH sides. Real panels are on other machines, which makes the
 * server's real cost lower than what is printed here, not higher.
 *
 *   npx tsx services/control-plane/bench/panels.ts [panels] [perHousehold]
 */

const PANELS = Number(process.argv[2] ?? 500);
const PER_HOUSEHOLD = Number(process.argv[3] ?? 3);

/** No database: this measures the transport, not Postgres. */
let authCalls = 0;
const fakeAuth = async (secret: string): Promise<AuthedDevice | null> => {
  authCalls += 1;
  const [, household, device] = secret.split(":");
  return { id: device, householdId: household, displayName: `Panel ${device}` };
};

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function main() {
  const households = Math.ceil(PANELS / PER_HOUSEHOLD);
  console.log(
    `\n  ${PANELS} panels across ${households} households (${PER_HOUSEHOLD} each)\n`,
  );

  if (global.gc) global.gc();
  const baseline = process.memoryUsage().heapUsed;

  const plane = await start({ port: 0, authenticate: fakeAuth });
  const url = `ws://127.0.0.1:${plane.port}/panel`;

  // --- connect -------------------------------------------------------------
  const connectStart = Date.now();
  const sockets: WebSocket[] = [];
  const welcomed: Promise<void>[] = [];

  for (let i = 0; i < PANELS; i++) {
    const householdId = `hh_${Math.floor(i / PER_HOUSEHOLD)}`;
    const deviceId = `dev_${i}`;
    const socket = new WebSocket(url);
    sockets.push(socket);

    welcomed.push(
      new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.once("open", () => {
          socket.send(JSON.stringify({ type: "hello", secret: `s:${householdId}:${deviceId}` }));
        });
        socket.once("message", () => resolve());
      }),
    );
  }

  await Promise.all(welcomed);
  const connectMs = Date.now() - connectStart;

  if (global.gc) global.gc();
  const held = process.memoryUsage().heapUsed;
  const stats = plane.registry.stats();

  // --- fan-out -------------------------------------------------------------
  /*
   * The operation this replaces: ask LiveKit who is in the lobby — a network
   * round trip returning the whole room, platform-wide before it was
   * namespaced — then publish a data message. Here, both are one map lookup.
   */
  const received = new Map<string, number>();
  for (let i = 0; i < PANELS; i++) {
    sockets[i]!.on("message", (data) => {
      const text = String(data);
      if (text.includes('"reminder"')) {
        received.set(`dev_${i}`, Date.now());
      }
    });
  }

  const ROUNDS = 200;
  const latencies: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const householdId = `hh_${r % households}`;
    const t0 = Date.now();
    plane.registry.sendAll(householdId, {
      type: "reminder",
      text: "bench",
      reminderId: `r_${r}`,
    });
    latencies.push(Date.now() - t0);
  }
  latencies.sort((a, b) => a - b);

  // Let the last round land before counting.
  await new Promise((r) => setTimeout(r, 250));

  // --- presence ------------------------------------------------------------
  const presenceStart = process.hrtime.bigint();
  let presenceChecks = 0;
  for (let r = 0; r < 1000; r++) {
    const householdId = `hh_${r % households}`;
    presenceChecks += plane.registry.online(householdId).length;
  }
  const presenceNs = Number(process.hrtime.bigint() - presenceStart) / 1000;

  // --- disconnect ----------------------------------------------------------
  const half = Math.floor(PANELS / 2);
  for (let i = 0; i < half; i++) sockets[i]!.close();
  await new Promise((r) => setTimeout(r, 500));
  const afterClose = plane.registry.stats();

  console.log("  connections");
  console.log(`    established      ${stats.connections} / ${PANELS}`);
  console.log(`    households       ${stats.households}`);
  console.log(`    time to connect  ${connectMs}ms  (${(PANELS / (connectMs / 1000)).toFixed(0)}/s)`);
  console.log(`    auth queries     ${authCalls}  — one per panel, for the life of the connection`);
  console.log();
  console.log("  memory (both sides of every socket, in one process)");
  console.log(`    baseline         ${mb(baseline)} MB`);
  console.log(`    holding ${String(stats.connections).padEnd(5)}    ${mb(held)} MB`);
  console.log(`    per connection   ${((held - baseline) / stats.connections / 1024).toFixed(1)} KB`);
  console.log();
  console.log("  fan-out to a household");
  console.log(`    rounds           ${ROUNDS}`);
  console.log(`    p50              ${latencies[Math.floor(ROUNDS * 0.5)]}ms`);
  console.log(`    p99              ${latencies[Math.floor(ROUNDS * 0.99)]}ms`);
  // Rounds walk households in order, so with fewer rounds than households only
  // the first ROUNDS of them are touched. Not a delivery failure.
  const expectedDelivered = Math.min(ROUNDS, households) * PER_HOUSEHOLD;
  console.log(
    `    delivered        ${received.size} / ${expectedDelivered} panels in the ` +
      `${Math.min(ROUNDS, households)} households touched`,
  );
  console.log();
  console.log("  presence");
  console.log(`    1000 lookups     ${presenceNs.toFixed(0)}µs total, ${presenceChecks} ids`);
  console.log(`    per lookup       ${(presenceNs / 1000).toFixed(2)}µs  — a map read, no store`);
  console.log();
  console.log("  disconnect");
  console.log(`    closed           ${half}`);
  console.log(`    still registered ${afterClose.connections}  (expected ${PANELS - half})`);
  console.log(
    `    presence correct ${afterClose.connections === PANELS - half ? "yes" : "NO — investigate"}`,
  );
  console.log();

  // --- what the polling architecture would cost at the same scale ----------
  /*
   * Arithmetic, not measurement: polling's cost is fully determined by the
   * beat interval and the queries per beat. Included so the two sit side by
   * side rather than in different documents.
   */
  const BEATS_PER_MIN = 6;
  const pollReqPerSec = (PANELS * BEATS_PER_MIN) / 60;
  console.log("  the same scale, polling every 10s");
  console.log(`    requests         ${pollReqPerSec.toFixed(0)}/s, continuously`);
  console.log(`    db queries (was) ${(pollReqPerSec * 3).toFixed(0)}/s  — 3 per beat`);
  console.log(`    db queries (now) ${((PANELS / 5 / 60)).toFixed(1)}/s  — throttled writeback only`);
  console.log(`    db queries (ws)  ~0  — ${PANELS} at connect, then none`);
  console.log();

  for (const s of sockets) s.close();
  await plane.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
