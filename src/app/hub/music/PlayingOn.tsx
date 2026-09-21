"use client";

import { useEffect, useState } from "react";
import { getDeviceSecret } from "@/lib/client/identity";
import { Eyebrow } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import type { PlaybackTarget, TargetGroup } from "@/lib/music/targets";

/**
 * Playing on — the household's own speakers, and only the ones awake.
 *
 * Every row here is a paired panel in a room. Controllers are left out: a
 * parent's phone running the app is a remote control, not a speaker. So is any
 * panel that has not checked in inside the presence window, because a tap on a
 * sleeping panel does nothing and the list should not invite one.
 *
 * Apple Music plays in this browser and cannot be sent elsewhere — its audio is
 * DRM-protected, so nothing can capture it to relay. Other rooms are therefore
 * shown for what they can genuinely do today, which is carry announcements and
 * calls over the house's own audio path.
 */

const REFRESH_MS = 15_000;

interface TargetsResponse {
  paired: boolean;
  devices?: PlaybackTarget[];
  groups?: TargetGroup[];
}

export default function PlayingOn({ isPlaying }: { isPlaying: boolean }) {
  const [state, setState] = useState<TargetsResponse | null>(null);

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

        {devices.map((d) => (
          <div
            key={d.id}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ${
              d.isSelf && isPlaying ? "" : "bg-transparent"
            }`}
            style={d.isSelf && isPlaying ? { background: "var(--color-accent)" } : undefined}
          >
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl"
              style={{
                background: d.isSelf && isPlaying ? "rgba(255,255,255,0.22)" : "rgba(59,92,246,0.10)",
                color: d.isSelf && isPlaying ? "#FFFFFF" : "var(--color-accent)",
              }}
            >
              <Icon name="speaker" size={17} />
            </span>

            <span className="flex min-w-0 flex-grow flex-col">
              <span
                className={`truncate text-[13px] font-semibold leading-[18px] ${
                  d.isSelf && isPlaying ? "text-white" : "text-text"
                }`}
              >
                {d.where}
              </span>
              <span
                className={`truncate text-xs leading-4 ${
                  d.isSelf && isPlaying ? "text-white" : "text-ink-muted"
                }`}
              >
                {d.isSelf ? (isPlaying ? "Playing now" : "This Hub") : "Awake · announcements"}
              </span>
            </span>

            <span
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{
                background: d.isSelf && isPlaying ? "#FFFFFF" : "rgba(15,23,42,0.18)",
              }}
            />
          </div>
        ))}

        {devices.length > 1 ? (
          <Note>
            Music plays on this Hub only — Apple Music&rsquo;s audio is protected and cannot be sent
            to another room.
          </Note>
        ) : null}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="px-3 py-2.5 text-xs leading-4 text-ink-muted">{children}</span>;
}
