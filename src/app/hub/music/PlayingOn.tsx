"use client";

import { useEffect, useState } from "react";
import type { RemoteAction } from "./useAppleMusic";
import { getDeviceSecret } from "@/lib/client/identity";
import { Eyebrow } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import type { PlaybackTarget, TargetGroup } from "@/lib/music/targets";
import type { AppleMusic } from "./useAppleMusic";

/**
 * Playing on — the household's own speakers, and only the ones awake.
 *
 * Every row here is a paired panel in a room. Controllers are left out: a
 * parent's phone running the app is a remote control, not a speaker. So is any
 * panel that has not checked in inside the presence window, because a tap on a
 * sleeping panel does nothing and the list should not invite one.
 *
 * Tapping a room moves the music, in whichever direction makes sense from
 * where you are standing. A room that is playing gives it up and it arrives
 * here; a room that is idle receives what is playing here. Either way one
 * panel ends up with it, because that is what Apple Music allows.
 *
 * The pull matters more than it looks: you are at the panel in the room you
 * walked into, and the music is somewhere else. Having to go back to the
 * kitchen to send it to the bedroom is the kind of thing that makes people
 * stop using a feature. Apple Music's
 * audio is DRM-protected, so nothing can capture one panel's output and relay
 * it to another — moving it is what is available.
 *
 * Each row says what that panel is playing, when it has said so recently
 * enough to be believed. A panel with nobody signed in to Apple Music still
 * appears, because it takes calls and announcements, but it is not offered as
 * somewhere to send music.
 */

const REFRESH_MS = 15_000;

interface TargetsResponse {
  paired: boolean;
  devices?: PlaybackTarget[];
  groups?: TargetGroup[];
}

export default function PlayingOn({ music }: { music: AppleMusic }) {
  const [state, setState] = useState<TargetsResponse | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  /** Which room's controls are open. One at a time; this is a narrow column. */
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isPlaying = music.isPlaying;

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const secret = getDeviceSecret();
        const res = await fetch("/api/music/targets", {
          cache: "no-store",
          headers: secret ? { "x-device-secret": secret } : undefined,
        });
        const json = (await res.json()) as TargetsResponse;
        if (alive) setState(json);
      } catch {
        // Leave the last good list up; a dropped poll is not a silent house.
      }
    };

    void read();
    // Shorter than the presence window, so a panel going quiet drops off here
    // within one refresh rather than lingering as a target that cannot play.
    const id = window.setInterval(read, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const devices = state?.devices ?? [];

  return (
    <div className="flex w-[300px] min-w-0 flex-none flex-col gap-2 max-[1200px]:w-[240px]">
      <span className="px-1">
        <Eyebrow tone="ink">Playing on</Eyebrow>
      </span>

      <div className="flex min-h-0 flex-grow flex-col gap-1 overflow-y-auto rounded-xl bg-surface p-2 shadow-card">
        {state && !state.paired ? (
          <Note>
            This Hub isn&rsquo;t paired to the house yet, so it has no speakers to list. Pair it and
            every awake panel appears here.
          </Note>
        ) : null}

        {state?.paired && !devices.length ? (
          <Note>No panels are awake right now.</Note>
        ) : null}

        {devices.map((d) => {
          const here = d.isSelf && isPlaying;
          // Somewhere to send it: not this panel, signed in, and we have a queue.
          const sendable = !d.isSelf && d.canPlay && music.queue.length > 0;
          // Something to take: it is playing there and not here.
          const takeable = !d.isSelf && !!d.playing && !isPlaying;
          const actionable = takeable || sendable;

          const move = async () => {
            if (!actionable || moving) return;
            setMoving(d.id);
            setProblem(null);
            // Taking wins when both are possible: you are standing here, and
            // what is playing over there is the thing you came for.
            const failure = takeable ? await music.bringHere(d.id) : await music.handOffTo(d.id);
            setMoving(null);
            if (failure) setProblem(failure);
          };

          return (
          <div key={d.id} className="flex flex-col">
          <button
            type="button"
            disabled={!actionable}
            onClick={move}
            aria-label={
              takeable
                ? `Bring the music here from ${d.where}`
                : sendable
                  ? `Move the music to ${d.where}`
                  : undefined
            }
            className={`flex items-center gap-3 rounded-xl border-none px-3.5 py-2.5 text-left transition-colors ${
              here ? "" : "bg-transparent"
            } ${actionable ? "cursor-pointer hover:bg-bg active:scale-[0.99]" : "cursor-default"}`}
            style={here ? { background: "var(--color-accent)" } : undefined}
          >
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl"
              style={{
                background: here ? "rgba(255,255,255,0.22)" : "rgba(59,92,246,0.10)",
                color: here ? "#FFFFFF" : "var(--color-accent)",
              }}
            >
              <Icon name="speaker" size={17} />
            </span>

            <span className="flex min-w-0 flex-grow flex-col">
              <span
                className={`truncate text-[13px] font-semibold leading-[18px] ${
                  here ? "text-white" : "text-text"
                }`}
              >
                {d.where}
              </span>
              <span
                className={`truncate text-xs leading-4 ${here ? "text-white" : "text-ink-muted"}`}
              >
                {d.isSelf
                  ? isPlaying
                    ? "Playing now"
                    : "This Hub"
                  : moving === d.id
                    ? takeable
                      ? "Bringing it here…"
                      : "Moving the music…"
                    : d.playing
                      ? `${d.playing.title}${d.playing.artist ? ` · ${d.playing.artist}` : ""}`
                      : sendable
                        ? "Tap to send it here"
                        : d.canPlay
                          ? "Awake"
                          : "Awake · not signed in"}
              </span>
            </span>

            {takeable ? (
              <span className="flex-none rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-white">
                Bring
              </span>
            ) : null}

            <span
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{
                background: here
                  ? "#FFFFFF"
                  : d.playing
                    ? "var(--color-accent)"
                    : "rgba(15,23,42,0.18)",
              }}
            />
          </button>

          {/* Turning the music down in a room you are not in is the thing a
              shared house actually needs. Only offered where there is
              something playing to turn down. */}
          {!d.isSelf && d.playing ? (
            <Remote
              open={open === d.id}
              onToggle={() => setOpen(open === d.id ? null : d.id)}
              where={d.where}
              onAct={async (action, value) => {
                const failure = await music.controlRemote(d.id, action, value);
                setProblem(failure);
              }}
            />
          ) : null}
          </div>
          );
        })}

        {problem ? <Note>{problem}</Note> : null}

        {devices.length > 1 ? (
          <Note>
            Tapping a room moves the music — here if it is playing there, there if it is playing
            here.
          </Note>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Transport and volume for a room you are not in.
 *
 * Folded away until asked for: this column is 300px on a panel, and four more
 * controls on every row would bury the thing the list is actually for, which is
 * seeing where the music is.
 *
 * Volume is sent as a level rather than a nudge, and only when the finger comes
 * off — a slider dragged across its width would otherwise send forty
 * instructions to another room.
 */
function Remote({
  open,
  onToggle,
  where,
  onAct,
}: {
  open: boolean;
  onToggle: () => void;
  where: string;
  onAct: (action: RemoteAction, value?: number) => void;
}) {
  const [level, setLevel] = useState(0.5);

  return (
    <div className="flex flex-col gap-2 px-3.5 pb-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="cursor-pointer self-start border-none bg-transparent p-0 text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-accent"
      >
        {open ? "Hide controls" : "Controls"}
      </button>

      {open ? (
        <div className="flex flex-col gap-2 pb-2">
          <div className="flex items-center gap-1">
            <Tap label={`Previous track in ${where}`} icon="prev" onClick={() => onAct("previous")} />
            <Tap label={`Play in ${where}`} icon="play" onClick={() => onAct("play")} />
            <Tap label={`Pause in ${where}`} icon="pause" onClick={() => onAct("pause")} />
            <Tap label={`Next track in ${where}`} icon="next" onClick={() => onAct("next")} />
          </div>

          <span className="flex items-center gap-2">
            <Icon name="speaker" size={15} className="flex-none text-ink-muted" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(level * 100)}
              aria-label={`Volume in ${where}`}
              onChange={(e) => setLevel(Number(e.target.value) / 100)}
              // Only on release: a drag across the slider would otherwise send
              // an instruction to another room for every pixel.
              onPointerUp={() => onAct("volume", level)}
              onKeyUp={() => onAct("volume", level)}
              className="h-1.5 flex-grow cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, var(--color-accent) ${level * 100}%, rgba(15,23,42,0.08) ${level * 100}%)`,
              }}
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Tap({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "prev" | "play" | "pause" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-bg text-text transition-transform active:scale-[0.97]"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="px-3 py-2.5 text-xs leading-4 text-ink-muted">{children}</span>;
}
