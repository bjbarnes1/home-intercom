"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Icon from "../_components/Icon";

/**
 * Small pieces the Music screen, search, browse and the mini-player share.
 */

/**
 * Album art, with the glyph as the floor.
 *
 * Apple's artwork URLs are templated and can 404 for a library item whose art
 * has not been rendered yet — a broken-image box on a wall display is worse
 * than no art at all, so a failed load falls back rather than showing one.
 */
export function Artwork({
  src,
  size,
  radius,
  glyph,
}: {
  src: string | null;
  size: number;
  radius: number;
  glyph: number;
}) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="flex-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label="No artwork"
      className="flex flex-none items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius, background: "rgba(59,92,246,0.10)" }}
    >
      <Icon name="music" size={glyph} className="text-accent" />
    </span>
  );
}

/**
 * The "E" every mainstream player puts beside an explicit song. On a kitchen
 * screen with children in front of it, people need to see it before they tap.
 */
export function ExplicitMark() {
  return (
    <span
      role="img"
      aria-label="Explicit"
      title="Explicit"
      className="inline-flex h-4 w-4 flex-none items-center justify-center rounded-[4px] text-[10px] font-bold leading-none text-white"
      style={{ background: "rgba(15,23,42,0.55)" }}
    >
      E
    </span>
  );
}

/** Apple's badge is 140.62 × 41 in its own units. */
const BADGE_RATIO = 140.62 / 41;

/**
 * "Listen on Apple Music" — Apple's own badge, and the credit the player owes
 * while music plays.
 *
 * The artwork is Apple's file, served unmodified from
 * public/brand/apple-music/: never redrawn, recoloured or animated. Apple's
 * minimum is 30px high on screen with clear space of a tenth of its height on
 * every side, and one badge per view — which is why only the player shows it.
 *
 * It links to the song on Apple Music. A wall panel has no browser to send
 * anyone to — following the link would take the Hub itself off its screens —
 * so the link opens as a QR code for a phone to pick up instead.
 */
export function ListenOnAppleMusic({ url, height = 32 }: { url: string | null; height?: number }) {
  const [open, setOpen] = useState(false);
  const h = Math.max(30, height);
  const badge = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/apple-music/listen-on-apple-music.svg"
      alt="Listen on Apple Music"
      width={Math.round(h * BADGE_RATIO)}
      height={h}
      style={{ height: h, width: "auto" }}
    />
  );

  return (
    <>
      {url ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-none cursor-pointer border-none bg-transparent"
          style={{ padding: Math.ceil(h / 10) }}
          aria-label="Listen on Apple Music — show a code to open this song on a phone"
        >
          {badge}
        </button>
      ) : (
        <span className="flex-none" style={{ padding: Math.ceil(h / 10) }}>
          {badge}
        </span>
      )}
      {open && url ? (
        <QrSheet
          url={url}
          title="Open on Apple Music"
          body="Scan with your phone's camera to open this song on Apple Music."
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * A link a wall panel cannot follow itself, as a code a phone can.
 */
export function QrSheet({
  url,
  title,
  body,
  onClose,
}: {
  url: string;
  title: string;
  body: string;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then((data) => {
        if (alive) setSrc(data);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-8"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex w-[380px] max-w-full flex-col items-center gap-4 rounded-[24px] bg-surface-2 p-6 text-center shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-heading text-xl font-bold leading-7 text-text">{title}</span>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={240} height={240} className="rounded-xl bg-white" />
        ) : (
          <span className="flex h-[240px] w-[240px] items-center justify-center rounded-xl bg-bg">
            <Icon name="music" size={40} className="text-accent" />
          </span>
        )}
        <span className="text-[13px] leading-[18px] text-ink-muted">{body}</span>
        <span className="max-w-full truncate text-xs leading-4 text-neutral-400">{url}</span>
        <button
          type="button"
          onClick={onClose}
          className="h-12 cursor-pointer rounded-full border-none bg-surface px-8 text-sm font-bold text-text transition-transform active:scale-[0.97]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
