"use client";

import { useEffect, useState } from "react";
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
 * Tapping a room hands the music to it rather than adding it: that panel picks
 * up the same queue at the same second, and this one falls quiet. Apple Music's
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

          const move = async () => {
            if (!sendable || moving) return;
            setMoving(d.id);
            setProblem(null);
            const failure = await music.handOffTo(d.id);
            setMoving(null);
            if (failure) setProblem(failure);
          };

          return (
          <button
            key={d.id}
            type="button"
            disabled={!sendable}
            onClick={move}
            aria-label={sendable ? `Move the music to ${d.where}` : undefined}
            className={`flex items-center gap-3 rounded-xl border-none px-3.5 py-2.5 text-left transition-colors ${
              here ? "" : "bg-transparent"
            } ${sendable ? "cursor-pointer hover:bg-bg active:scale-[0.99]" : "cursor-default"}`}
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
                    ? "Moving the music…"
                    : d.playing
                      ? `${d.playing.title}${d.playing.artist ? ` · ${d.playing.artist}` : ""}`
                      : sendable
                        ? "Tap to move the music here"
                        : d.canPlay
                          ? "Awake"
                          : "Awake · not signed in"}
              </span>
            </span>

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
          );
        })}

        {problem ? <Note>{problem}</Note> : null}

        {devices.length > 1 ? (
          <Note>
            Tapping a room moves the music there rather than adding it.
          </Note>
        ) : null}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="px-3 py-2.5 text-xs leading-4 text-ink-muted">{children}</span>;
}
