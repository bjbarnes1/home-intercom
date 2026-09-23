/**
 * Waiting to hear that a handoff actually started playing.
 *
 * The sending panel used to go quiet on the 200 from /api/music/handoff, which
 * only says the command was published. A target with a stale Apple Music token
 * then failed quietly and both rooms went silent. Now the sender stays audible
 * until the target answers, and keeps playing if it says no or never answers.
 *
 * Kept free of React and MusicKit so the timing can be tested on its own.
 */

export type HandoffOutcome =
  | { kind: "played" }
  | { kind: "refused"; error: string }
  | { kind: "timeout" };

export interface HandoffAnswer {
  handoffId: string;
  ok: boolean;
  error?: string;
}

/**
 * How long to wait for the other panel. Setting a queue, starting it and
 * seeking to the playhead takes MusicKit a few seconds on a slow network, so
 * this is generous. Past it, the music stays here.
 */
export const HANDOFF_ACK_MS = 12_000;

/**
 * How long an answer that arrives after the timeout is still acted on. A late
 * "it started" still means two rooms are playing one subscription, and this
 * one should be the one to stop.
 */
export const LATE_ACK_MS = 60_000;

export class HandoffWaiter {
  private pending = new Map<string, { resolve: (o: HandoffOutcome) => void; timer: ReturnType<typeof setTimeout> }>();
  private late = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * @param onLatePlay called when a handoff that already timed out turns out
   *   to have started after all.
   */
  constructor(
    private readonly onLatePlay: () => void,
    private readonly timeoutMs = HANDOFF_ACK_MS,
    private readonly lateMs = LATE_ACK_MS,
  ) {}

  /**
   * Start waiting. Call before sending the handoff: the answer comes over the
   * control channel and can arrive before the HTTP response does.
   */
  expect(handoffId: string): Promise<HandoffOutcome> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(handoffId);
        this.late.set(
          handoffId,
          setTimeout(() => this.late.delete(handoffId), this.lateMs),
        );
        resolve({ kind: "timeout" });
      }, this.timeoutMs);
      this.pending.set(handoffId, { resolve, timer });
    });
  }

  /** Stop waiting without an outcome, e.g. when the handoff request itself failed. */
  cancel(handoffId: string): void {
    const p = this.pending.get(handoffId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(handoffId);
  }

  /** An answer arrived. Ignored unless it is for a handoff this panel sent. */
  settle(answer: HandoffAnswer): void {
    const p = this.pending.get(answer.handoffId);
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(answer.handoffId);
      p.resolve(
        answer.ok
          ? { kind: "played" }
          : { kind: "refused", error: answer.error ?? "That panel could not play it" },
      );
      return;
    }

    const lateTimer = this.late.get(answer.handoffId);
    if (lateTimer !== undefined) {
      clearTimeout(lateTimer);
      this.late.delete(answer.handoffId);
      if (answer.ok) this.onLatePlay();
    }
  }
}

/** An id for one handoff. Only has to be unique among this panel's own. */
export function newHandoffId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // randomUUID needs a secure context; a panel on plain http still hands off.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
