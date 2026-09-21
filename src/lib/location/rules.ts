/**
 * Geofence → announcement.
 *
 * A geofence crossing is already on the server, and so is a house full of
 * speakers. Wiring one to the other is the thing this house can do that an
 * off-the-shelf tracker can't: "when Willoughby's phone enters Home, say
 * *Willoughby's home* on the kitchen panel."
 *
 * The matching, rendering and cooldown logic is pure so it can be tested
 * without a database or a speaker.
 */

import { prisma } from "@/lib/prisma";
import { deliverAnnouncement } from "@/lib/announce/deliver";
import { reportError } from "@/lib/errors/report";
import type { PlaceTrigger } from "@prisma/client";

/** The template placeholders a rule may use. */
export interface TemplateValues {
  name: string;
  place: string;
}

/**
 * Substitute `{name}` and `{place}`. Unknown placeholders are left alone rather
 * than blanked — a rule that says "{nmae} is home" should read visibly wrong,
 * not silently speak "is home".
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{(name|place)\}/g, (_match, key: keyof TemplateValues) =>
    values[key],
  );
}

export interface RuleCandidate {
  id: string;
  trigger: PlaceTrigger;
  placeId: string;
  subjectUserId: string | null;
  enabled: boolean;
}

export interface CrossingEvent {
  placeId: string;
  trigger: PlaceTrigger;
  userId: string;
}

/**
 * Which rules a crossing should fire. A rule with no subject means anyone in
 * the household, which is how "when *someone* gets home" is expressed.
 */
export function matchingRules<T extends RuleCandidate>(
  rules: T[],
  event: CrossingEvent,
): T[] {
  return rules.filter(
    (rule) =>
      rule.enabled &&
      rule.placeId === event.placeId &&
      rule.trigger === event.trigger &&
      (rule.subjectUserId === null || rule.subjectUserId === event.userId),
  );
}

/**
 * Whether a rule is still inside its cooldown for this person.
 *
 * A phone sitting on the edge of a geofence can cross it repeatedly, and a
 * house that announces "Willoughby's home" five times gets the feature turned
 * off. A cooldown of zero disables the check.
 */
export function isCoolingDown(
  lastFiredAt: Date | null | undefined,
  cooldownMinutes: number,
  now: Date,
): boolean {
  if (!lastFiredAt || cooldownMinutes <= 0) return false;
  const elapsedMs = now.getTime() - lastFiredAt.getTime();
  // A clock that jumped backwards shouldn't silence the house indefinitely.
  if (elapsedMs < 0) return false;
  return elapsedMs < cooldownMinutes * 60 * 1000;
}

export interface FiredRule {
  ruleId: string;
  text: string;
  reached: number;
}

export interface RuleFireResult {
  considered: number;
  fired: FiredRule[];
  skippedByCooldown: number;
}

/**
 * Evaluate and fire every rule matching a set of crossings. Called from the
 * ping route once visits have been opened or closed.
 *
 * Never throws: an announcement that fails must not fail the location report
 * that triggered it — losing the ping would lose the arrival itself.
 */
export async function firePlaceRules(
  householdId: string,
  userId: string,
  crossings: Array<{ placeId: string; trigger: PlaceTrigger }>,
  now: Date,
): Promise<RuleFireResult> {
  const result: RuleFireResult = { considered: 0, fired: [], skippedByCooldown: 0 };
  if (crossings.length === 0) return result;

  const [rules, person] = await Promise.all([
    prisma.placeRule.findMany({
      where: {
        householdId,
        enabled: true,
        placeId: { in: crossings.map((c) => c.placeId) },
      },
      include: {
        place: { select: { name: true } },
        fires: { where: { userId }, select: { firedAt: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);

  if (rules.length === 0 || !person) return result;

  for (const crossing of crossings) {
    const matched = matchingRules(rules, {
      placeId: crossing.placeId,
      trigger: crossing.trigger,
      userId,
    });
    result.considered += matched.length;

    for (const rule of matched) {
      if (isCoolingDown(rule.fires[0]?.firedAt, rule.cooldownMinutes, now)) {
        result.skippedByCooldown += 1;
        continue;
      }

      const text = renderTemplate(rule.template, {
        name: person.name,
        place: rule.place.name,
      });

      try {
        const outcome = await deliverAnnouncement({
          householdId,
          text,
          from: person.name,
          targetDeviceId: rule.targetDeviceId ?? undefined,
          targetZoneId: rule.targetZoneId ?? undefined,
          summary: `${rule.trigger === "ARRIVE" ? "Arrived" : "Left"} ${rule.place.name} · ${text}`,
        });

        // Stamp the cooldown even when nothing was reached. The rule did fire;
        // that no speaker was connected is not a reason to try again a minute
        // later when the phone re-reports the same crossing.
        await prisma.placeRuleFire.upsert({
          where: { ruleId_userId: { ruleId: rule.id, userId } },
          create: { ruleId: rule.id, userId, firedAt: now },
          update: { firedAt: now },
        });

        result.fired.push({ ruleId: rule.id, text, reached: outcome.reached.length });
      } catch (e) {
        // Deliberately swallowed: the arrival matters more than the sentence.
        reportError(e, {
          code: "place_rule.fire",
          route: "firePlaceRules",
          ruleId: rule.id,
        });
      }
    }
  }

  return result;
}
