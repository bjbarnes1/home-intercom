/**
 * Soft attention chime before speech. Uses Web Audio so we don't need a
 * static asset; skipped when whisper/quiet hours apply.
 */

export function playChime(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return Promise.resolve();

  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.start(t0);
    osc.stop(t0 + 0.3);
    return new Promise((resolve) => {
      osc.onended = () => {
        void ctx.close();
        resolve();
      };
      setTimeout(() => {
        void ctx.close();
        resolve();
      }, 400);
    });
  } catch {
    return Promise.resolve();
  }
}
