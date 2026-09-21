/**
 * The chime that goes before an announcement.
 *
 * Synthesised rather than sampled: no asset to ship, nothing borrowed from
 * anywhere, and it stays crisp at any volume because it is generated at the
 * device's own sample rate.
 *
 * The shape is four rising notes — D5, A5, B5, D6. A fifth, then a tone, then
 * a minor third: the wide first leap is what makes it read as bright rather
 * than as a doorbell, and the B in the middle keeps it from being a plain major
 * arpeggio, which is what most notification sounds already are. It lands on the
 * octave, so it finishes rather than trailing off — a chime that does not
 * resolve leaves people waiting instead of listening.
 *
 * Each note is a fundamental with two quiet partials above it, which is roughly
 * how a struck bell behaves, and they overlap so the last two ring together.
 * Kept under half a second: this is a throat-clear before a voice, and anything
 * longer is a ringtone.
 */

export interface ChimeNote {
  /** Hertz. */
  freq: number;
  /** Seconds from the start of the chime. */
  at: number;
  /** Seconds the note takes to fade out. */
  decay: number;
  /** Relative loudness, 0–1, before the overall volume is applied. */
  level: number;
}

/** D5, A5, B5, D6 — rising, overlapping, resolving on the octave. */
export const CHIME: ChimeNote[] = [
  { freq: 587.33, at: 0, decay: 0.42, level: 0.9 },
  { freq: 880.0, at: 0.085, decay: 0.42, level: 0.85 },
  { freq: 987.77, at: 0.17, decay: 0.46, level: 0.8 },
  { freq: 1174.66, at: 0.26, decay: 0.62, level: 1 },
];

/** Bell-like: the fundamental, plus an octave and a twelfth well underneath it. */
const PARTIALS: { ratio: number; level: number }[] = [
  { ratio: 1, level: 1 },
  { ratio: 2, level: 0.22 },
  { ratio: 3, level: 0.07 },
];

/** Loud enough to turn a head, quiet enough not to make anybody jump. */
const PEAK = 0.15;

/** How long the whole thing takes, including the last note's tail. */
export function chimeDuration(notes: ChimeNote[] = CHIME): number {
  return notes.reduce((end, n) => Math.max(end, n.at + n.decay), 0);
}

export function playChime(volume = 1): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return Promise.resolve();

  const level = Math.min(1, Math.max(0, volume)) * PEAK;
  if (level <= 0) return Promise.resolve();

  try {
    const ctx = new AudioCtx();

    // Takes the edge off the upper partials, so it is bright without being
    // shrill on a small panel speaker.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;

    const out = ctx.createGain();
    out.gain.value = level;
    tone.connect(out);
    out.connect(ctx.destination);

    const t0 = ctx.currentTime + 0.02;
    for (const note of CHIME) {
      for (const partial of PARTIALS) {
        strike(ctx, tone, note, partial, t0);
      }
    }

    const total = chimeDuration();
    return new Promise((resolve) => {
      const done = () => {
        void ctx.close().catch(() => {});
        resolve();
      };
      // Resolved on a timer rather than on the last oscillator ending: speech
      // must not wait on an audio graph that a backgrounded tab never finishes.
      window.setTimeout(done, (total + 0.1) * 1000);
    });
  } catch {
    // A panel that cannot make a sound should still say the announcement.
    return Promise.resolve();
  }
}

function strike(
  ctx: AudioContext,
  destination: AudioNode,
  note: ChimeNote,
  partial: { ratio: number; level: number },
  t0: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = note.freq * partial.ratio;

  const start = t0 + note.at;
  const peak = note.level * partial.level;

  // Fast attack, exponential decay — a struck bell, not a beep with edges.
  // Exponential ramps cannot reach zero, hence the near-silent floor.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + note.decay);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + note.decay + 0.02);
}
