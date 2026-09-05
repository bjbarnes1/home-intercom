import { PrismaClient } from "@prisma/client";
import { generateDeviceSecret } from "../src/lib/devices/pairing";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

// Dev password for seeded parents. Override with SEED_ADMIN_PASSWORD; change it
// before any real deployment.
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

/**
 * Seed a starter household so the app is usable immediately in dev.
 * Devices are created ACTIVE with secrets so you can exercise flows without
 * the pairing dance; in real use devices start PENDING and pair with a code.
 */
async function main() {
  const household = await prisma.household.upsert({
    where: { id: "seed-household" },
    update: {},
    create: { id: "seed-household", name: "Barnes / Wilkes" },
  });

  const parents = [
    { name: "Soph", email: "soph@example.com" },
    { name: "BJ", email: "bj@example.com" },
  ];
  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const p of parents) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: { passwordHash },
      create: {
        householdId: household.id,
        name: p.name,
        email: p.email,
        role: "ADMIN",
        passwordHash,
      },
    });
  }

  const deviceSpecs = [
    { key: "gus", displayName: "Gus", room: "Gus's room" },
    { key: "georgette", displayName: "Georgette", room: "Georgette's room" },
    { key: "willoughby", displayName: "Willoughby", room: "Willoughby's room" },
    { key: "raff", displayName: "Raff", room: "Raff's room" },
    { key: "kitchen", displayName: "Kitchen", room: "Kitchen" },
    { key: "rumpus", displayName: "Rumpus", room: "Rumpus" },
    { key: "lounge", displayName: "Lounge", room: "Lounge" },
  ];

  const devices: Record<string, string> = {};
  for (const spec of deviceSpecs) {
    const id = `seed-${spec.key}`;
    const device = await prisma.device.upsert({
      where: { id },
      update: { displayName: spec.displayName, room: spec.room },
      create: {
        id,
        householdId: household.id,
        displayName: spec.displayName,
        room: spec.room,
        type: "ENDPOINT",
        pairing: "ACTIVE",
        deviceSecret: generateDeviceSecret(),
      },
    });
    devices[spec.key] = device.id;
  }

  const zones: Record<string, string[]> = {
    Kids: ["gus", "georgette", "willoughby", "raff"],
    Downstairs: ["kitchen", "rumpus", "lounge"],
    Everyone: ["gus", "georgette", "willoughby", "raff", "kitchen", "rumpus", "lounge"],
  };
  for (const [name, members] of Object.entries(zones)) {
    const zone = await prisma.zone.upsert({
      where: { householdId_name: { householdId: household.id, name } },
      update: {},
      create: { householdId: household.id, name },
    });
    for (const key of members) {
      await prisma.zoneMembership.upsert({
        where: { zoneId_deviceId: { zoneId: zone.id, deviceId: devices[key] } },
        update: {},
        create: { zoneId: zone.id, deviceId: devices[key] },
      });
    }
  }

  console.log(`Seeded household "${household.name}" with ${deviceSpecs.length} devices.`);
  console.log(
    `Parents can sign in with soph@example.com / bj@example.com (password: "${SEED_PASSWORD}").`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
