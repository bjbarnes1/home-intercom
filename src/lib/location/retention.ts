/**
 * Location retention.
 *
 * A leaked intercom log says who paged whom. A leaked location history says
 * where a child was, every day, for years — a different category of harm
 * entirely. So history here is deliberately short-lived and deliberately
 * imprecise once it stops being useful:
 *
 *   fresh (< 24h)  full precision — "where is everyone right now"
 *   aged  (> 24h)  rounded to ~100m — enough for "left home around 8:15"
 *   old   (> 7d)   deleted
 *
 * That last line covers the derived record too. A PlaceVisit — "arrived School
 * 08:31, left 15:08" — is a higher-fidelity picture of a child's routine than
 * the raw fixes it came from, and it used to be kept forever while the consent
 * screen said seven days. The screen reads the constants below, so the promise
 * and the sweep cannot drift apart.
 *
 * These are the numbers the household agreed to; changing them is a decision,
 * not a tuning knob.
 */

import { prisma } from "@/lib/prisma";

/** How long a fix keeps its full precision. */
export const COARSEN_AFTER_HOURS = 24;

/** How long any history is kept at all. */
export const DELETE_AFTER_DAYS = 7;

/**
 * Decimal places kept when coarsening. Three places is ~110m of latitude
 * anywhere on Earth — a street, not a doorstep.
 */
export const COARSE_DECIMALS = 3;

/** Round one coordinate to the coarse grid. Exported for testing. */
export function coarsenCoordinate(value: number): number {
  const factor = 10 ** COARSE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export interface RetentionCutoffs {
  coarsenBefore: Date;
  deleteBefore: Date;
}

/** The two cutoff instants for a given "now". Pure, so it can be tested. */
export function retentionCutoffs(now: Date): RetentionCutoffs {
  return {
    coarsenBefore: new Date(now.getTime() - COARSEN_AFTER_HOURS * 60 * 60 * 1000),
    deleteBefore: new Date(now.getTime() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000),
  };
}

export interface RetentionResult {
  coarsened: number;
  deleted: number;
  /** PlaceVisit rows deleted on the same seven-day promise. */
  visitsDeleted: number;
}

/**
 * Apply retention. Called every minute from the cron tick, which makes each
 * sweep tiny — there is never a big backlog to grind through.
 *
 * Deletion runs first so we never spend work coarsening rows that are about to
 * go anyway.
 */
export async function pruneLocationHistory(now: Date): Promise<RetentionResult> {
  const { coarsenBefore, deleteBefore } = retentionCutoffs(now);

  const { count: deleted } = await prisma.locationPing.deleteMany({
    where: { capturedAt: { lt: deleteBefore } },
  });

  // Keyed on arrivedAt, so a visit is judged by when it started: a stay that
  // began eight days ago goes even if its exit was recorded yesterday.
  const { count: visitsDeleted } = await prisma.placeVisit.deleteMany({
    where: { arrivedAt: { lt: deleteBefore } },
  });

  // Rounding happens in SQL so a day's worth of rows is one statement rather
  // than a read-modify-write per row.
  //
  // The `::int` on the decimals is load-bearing. Prisma binds a JavaScript
  // integer as int8, Postgres has round(numeric, integer) but no
  // round(numeric, bigint), and it will not pick one by implicit cast — so
  // without it every sweep failed with 42883 and nothing was ever coarsened.
  const coarsened = await prisma.$executeRaw`
    UPDATE "LocationPing"
    SET "lat" = ROUND("lat"::numeric, ${COARSE_DECIMALS}::int)::double precision,
        "lng" = ROUND("lng"::numeric, ${COARSE_DECIMALS}::int)::double precision,
        "accuracyM" = NULL,
        "coarse" = true
    WHERE "coarse" = false AND "capturedAt" < ${coarsenBefore}
  `;

  return { coarsened, deleted, visitsDeleted };
}
