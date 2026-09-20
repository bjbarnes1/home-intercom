import type { ReactNode } from "react";

/**
 * Hub prototype — Overlay Card.
 *
 * The one shell for anything that interrupts the Base Layer: identity check, the
 * profile grid, a broadcast, an intercom call. Opaque surface, the largest radius
 * in the system, over a flat scrim — deliberately not a blur, which is costly to
 * composite continuously on embedded hardware and reads as the same frosted look
 * every other ambient display already wears.
 *
 * Every use ships one of two explicit exits: a visible close, or a stated
 * countdown. Tapping the backdrop is never the only way out.
 */
export default function OverlayCard({
  width = 480,
  children,
  backdrop,
}: {
  width?: number;
  children: ReactNode;
  /** A sketch of the screen being interrupted, so it stays perceptible underneath. */
  backdrop?: ReactNode;
}) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="absolute inset-0">{backdrop}</div>
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.4)" }} />
      <div
        className="absolute left-1/2 top-1/2 flex max-h-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center overflow-hidden rounded-[32px] p-8"
        style={{
          width,
          maxWidth: "calc(100% - 48px)",
          background: "var(--color-surface-2)",
          boxShadow: "var(--shadow-overlay)",
        }}
      >
        <span className="mb-5 h-[5px] w-11 flex-none rounded-full" style={{ background: "rgba(15,23,42,0.14)" }} />
        {children}
      </div>
    </div>
  );
}

/** The dimmed Base Layer behind an Overlay — shape only, never live content. */
export function BackdropSketch({ rows = 4, hero }: { rows?: number; hero?: string }) {
  return (
    <div className="flex h-full flex-col gap-4 px-8 pb-6 pt-[72px]" style={{ paddingLeft: 116 }}>
      {hero ? <span className="font-heading text-[88px] font-extrabold leading-none text-text">{hero}</span> : null}
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="h-20 flex-none rounded-xl bg-surface" />
      ))}
    </div>
  );
}
