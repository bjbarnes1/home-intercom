"use client";

import { useState } from "react";
import { useTalk } from "@/lib/client/useTalk";
import { identStyle } from "@/lib/color/identity";
import type { DeviceRow } from "./types";

export default function PageTalk({
  target,
  onBack,
}: {
  target: DeviceRow;
  onBack: () => void;
}) {
  const { status, message, start, stop } = useTalk();
  const [inCall, setInCall] = useState(false);
  const live = status === "live";

  const toggleCall = async () => {
    if (inCall) {
      await stop();
      setInCall(false);
    } else {
      setInCall(true);
      await start({ kind: "call", deviceId: target.id });
    }
  };

  return (
    <div
      className="hi-tinted mx-auto flex min-h-screen max-w-md flex-col p-5"
      style={identStyle(target.displayName)}
    >
      <header className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost min-h-9 px-2">
          <i className="ph ph-caret-left text-lg" />
        </button>
        <div className="flex-1">
          <div
            className="font-heading text-lg font-medium"
            style={{ color: "var(--hi-ident)" }}
          >
            {target.displayName}
          </div>
          <div className="text-xs text-neutral-500">
            {target.online ? "Online" : "Offline"}
          </div>
        </div>
        <button
          onClick={toggleCall}
          disabled={!target.online}
          className={`btn min-h-9 ${inCall ? "btn-outline" : "btn-secondary"}`}
        >
          <i className={`ph ${inCall ? "ph-phone-x" : "ph-phone"}`} />
          {inCall ? "End" : "Call"}
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {live ? (
          <div className="flex flex-col items-center gap-3">
            <span className="tag tag-ident uppercase tracking-wider">
              {inCall ? "On call" : "On air"}
            </span>
            <div className="levels h-10">
              {[0.62, 0.48, 0.72, 0.54, 0.66].map((d, i) => (
                <span key={i} style={{ height: 40, animationDuration: `${d}s` }} />
              ))}
            </div>
            <div className="text-sm text-neutral-400">
              {inCall ? "Two-way — you can both talk" : "They can hear you"}
            </div>
          </div>
        ) : (
          <p className="max-w-[250px] text-center text-sm text-neutral-400">
            {status === "error"
              ? message
              : "Hold to page this room. Use Call for a two-way line."}
          </p>
        )}

        {inCall ? (
          <button onClick={toggleCall} className="ptt" data-live={live}>
            <i className="ph-fill ph-phone-x text-5xl" />
            <span className="font-heading text-sm font-medium">End call</span>
          </button>
        ) : (
          <div
            className="ptt"
            data-live={live}
            onPointerDown={() => start({ kind: "page", deviceId: target.id })}
            onPointerUp={stop}
            onPointerLeave={() => live && stop()}
          >
            <i className="ph-fill ph-microphone text-5xl" />
            <span className="font-heading text-sm font-medium">
              {live ? "Talking" : "Hold to talk"}
            </span>
          </div>
        )}
        <div className="text-xs text-neutral-600">
          {inCall ? "Tap to hang up" : "Release to close the channel"}
        </div>
      </div>
    </div>
  );
}
