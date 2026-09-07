"use client";

import { useEffect, useMemo, useState } from "react";
import { useTalk } from "@/lib/client/useTalk";
import { identStyle } from "@/lib/color/identity";
import type { ZoneRow } from "./types";

export default function Broadcast({ zones }: { zones: ZoneRow[] }) {
  const { status, message, start, stop } = useTalk();
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [mode, setMode] = useState<"say" | "live">("say");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const selected = useMemo(
    () => zones.find((z) => z.id === zoneId) ?? null,
    [zones, zoneId],
  );
  const live = status === "live";

  useEffect(() => {
    if (!zoneId && zones.length) setZoneId(zones[zones.length - 1].id);
  }, [zones, zoneId]);

  async function announce() {
    if (!zoneId || !text.trim()) return;
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/announce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), targetZoneId: zoneId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult("Couldn't send that.");
        return;
      }
      const reached = (data.reached ?? []).length;
      const missed = (data.notConnected ?? []).length + (data.offline ?? []).length;
      const voiceNote =
        data.voice === "ash"
          ? " · Ash voice"
          : reached > 0
            ? " · device voice (Ash not configured)"
            : "";
      setResult(
        reached > 0
          ? `Spoken on ${reached} ${reached === 1 ? "speaker" : "speakers"}` +
              voiceNote +
              (missed ? ` · ${missed} not reached` : "")
          : "No speakers reached — none connected.",
      );
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="mb-4">
        <h1 className="m-0 text-2xl">Broadcast</h1>
        <div className="text-xs text-neutral-500">One way, every speaker at once</div>
      </header>

      <div className="mb-4 flex gap-1.5">
        {(
          [
            ["say", "ph-chat-text", "Say something"],
            ["live", "ph-microphone", "Talk live"],
          ] as ["say" | "live", string, string][]
        ).map(([m, icon, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              mode === m ? "bg-accent text-[#141221]" : "card text-neutral-300"
            }`}
          >
            <i className={`ph ${icon}`} />
            {label}
          </button>
        ))}
      </div>

      <div className="uplabel mb-2">Send to</div>
      <div className="mb-4 flex flex-col gap-1.5">
        {zones.map((z) => {
          const on = z.id === zoneId;
          return (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              aria-pressed={on}
              className="hi-tinted hi-chip w-full justify-between"
              style={identStyle(z.name)}
            >
              <div className="text-left">
                <div className="font-heading text-[15px] font-medium">{z.name}</div>
                <div className="text-[11px] text-neutral-500">
                  {z.deviceCount} endpoints · {z.onlineCount} online
                </div>
              </div>
              <i
                className={`ph-fill ph-check-circle text-xl ${on ? "" : "text-neutral-700"}`}
                style={on ? { color: "var(--hi-ident)" } : undefined}
              />
            </button>
          );
        })}
      </div>

      {mode === "say" ? (
        <>
          <textarea
            className="input mb-3 min-h-24"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dinner's ready — wash your hands, please."
          />
          <button
            onClick={announce}
            disabled={sending || !text.trim() || !zoneId}
            className="btn btn-primary min-h-12 w-full"
          >
            <i className="ph-fill ph-megaphone-simple text-lg" />
            {sending ? "Sending…" : `Announce to ${selected?.name ?? "…"}`}
          </button>
          {result && (
            <p className="mt-3 text-center text-sm text-neutral-400">{result}</p>
          )}
          <p className="mt-3 text-center text-[11px] text-neutral-600">
            Spoken aloud on every connected speaker. No waiting to connect.
          </p>
        </>
      ) : (
        <div
          className="hi-tinted flex flex-col items-center justify-center gap-5 py-6"
          style={identStyle(selected?.name)}
        >
          {live && (
            <div className="flex flex-col items-center gap-2">
              <span className="tag tag-ident uppercase tracking-wider">
                Live to {selected?.name}
              </span>
              <div className="text-sm text-neutral-400">
                {selected?.onlineCount} speakers open
              </div>
            </div>
          )}
          {status === "error" && <p className="text-sm text-accent-200">{message}</p>}
          <div
            className="ptt"
            data-live={live}
            onPointerDown={() => zoneId && start({ kind: "broadcast", zoneId })}
            onPointerUp={stop}
            onPointerLeave={() => live && stop()}
          >
            <i className="ph-fill ph-megaphone-simple text-5xl" />
            <span className="font-heading text-sm font-medium">
              {live ? "Broadcasting" : "Hold to talk"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
