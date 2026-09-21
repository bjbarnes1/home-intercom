import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The coarsening statement, pinned.
 *
 * This ran every minute for a week and failed every time with Postgres 42883 —
 * `function round(numeric, bigint) does not exist`. Prisma binds a JavaScript
 * integer as int8, Postgres has `round(numeric, integer)` and no bigint
 * overload, and it will not choose one by implicit cast.
 *
 * Nothing about that is visible from the TypeScript: the types are fine, the
 * template is fine, and it only fails against a real database. So the shape of
 * the SQL is asserted here instead, because the alternative is finding out from
 * production again.
 */

const executeRaw = vi.fn().mockResolvedValue(3);
const deleteMany = vi.fn().mockResolvedValue({ count: 7 });
const deleteVisits = vi.fn().mockResolvedValue({ count: 2 });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      executeRaw(strings, ...values),
    locationPing: { deleteMany: (args: unknown) => deleteMany(args) },
    placeVisit: { deleteMany: (args: unknown) => deleteVisits(args) },
  },
}));

afterEach(() => {
  executeRaw.mockClear();
  deleteMany.mockClear();
  deleteVisits.mockClear();
});

async function sweep() {
  const { pruneLocationHistory } = await import("./retention");
  return pruneLocationHistory(new Date("2026-09-21T10:00:00Z"));
}

/** The statement as Postgres would see it, parameters left as placeholders. */
function sql(): string {
  const [strings] = executeRaw.mock.calls[0] as [TemplateStringsArray];
  return strings.join("?").replace(/\s+/g, " ").trim();
}

describe("the coarsening statement", () => {
  it("casts the decimal places to int, which is the whole bug", async () => {
    await sweep();
    // Prisma sends the bound integer as int8; without this cast Postgres looks
    // for round(numeric, bigint), which does not exist.
    expect(sql()).toContain("?::int");
    expect(sql().match(/\?::int/g)).toHaveLength(2);
  });

  it("rounds through numeric and stores back as double precision", async () => {
    await sweep();
    expect(sql()).toContain('ROUND("lat"::numeric');
    expect(sql()).toContain('ROUND("lng"::numeric');
    expect(sql()).toContain("::double precision");
  });

  it("only touches rows that have not been coarsened already", async () => {
    await sweep();
    // Without this the sweep would re-round every old row every minute, and
    // "coarsened" would never settle to zero.
    expect(sql()).toContain('"coarse" = false');
  });

  it("drops the accuracy, which is as identifying as the position", async () => {
    await sweep();
    expect(sql()).toContain('"accuracyM" = NULL');
  });

  it("deletes before it coarsens, so it never rounds rows about to go", async () => {
    await sweep();
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      executeRaw.mock.invocationCallOrder[0],
    );
  });

  it("reports what it did", async () => {
    expect(await sweep()).toEqual({ coarsened: 3, deleted: 7, visitsDeleted: 2 });
  });
});

describe("the derived record", () => {
  /*
   * A PlaceVisit — "arrived School 08:31, left 15:08" — is a sharper picture of
   * a child's routine than the raw fixes it came from. It was kept forever
   * while the consent screen promised seven days.
   */
  it("prunes visits on the same seven-day cutoff as the pings", async () => {
    await sweep();
    const [pings] = deleteMany.mock.calls[0] as [{ where: { capturedAt: { lt: Date } } }];
    const [visits] = deleteVisits.mock.calls[0] as [{ where: { arrivedAt: { lt: Date } } }];
    expect(visits.where.arrivedAt.lt.getTime()).toBe(pings.where.capturedAt.lt.getTime());
  });

  it("judges a visit by when it started, not when it ended", async () => {
    await sweep();
    const [visits] = deleteVisits.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(Object.keys(visits.where)).toEqual(["arrivedAt"]);
  });
});
