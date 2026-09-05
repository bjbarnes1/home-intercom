"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Room, RoomEvent } from "livekit-client";
import { controllerIdentity } from "@/lib/client/identity";

interface DeviceRow {
  id: string;
  displayName: string;
  room: string | null;
  type: "ENDPOINT" | "CONTROLLER";
  pairing: string;
  online: boolean;
}

type Status = "idle" | "connecting" | "live" | "error";

export default function ControllerPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const roomRef = useRef<Room | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      setDevices((data.devices ?? []).filter((d: DeviceRow) => d.type === "ENDPOINT"));
    } catch {
      setMessage("Could not load devices");
    }
  }, [router]);

  // Gate on auth first, then poll devices.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!cancelled) setMe(data.user);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    loadDevices();
    const t = setInterval(loadDevices, 5000);
    return () => clearInterval(t);
  }, [me, loadDevices]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  const stopTalking = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setActiveId(null);
    setStatus("idle");
    if (room) {
      await room.disconnect();
    }
  }, []);

  const startPage = useCallback(
    async (deviceId: string) => {
      setStatus("connecting");
      setActiveId(deviceId);
      setMessage("");
      try {
        const res = await fetch("/api/page", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "page",
            initiatorIdentity: controllerIdentity(),
            targetDeviceId: deviceId,
          }),
        });
        if (!res.ok) throw new Error(`page failed (${res.status})`);
        const data = await res.json();

        if (data.reached?.length === 0) {
          setStatus("error");
          setMessage("That device is offline.");
          setActiveId(null);
          return;
        }

        const room = new Room();
        roomRef.current = room;
        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) stopTalking();
        });
        await room.connect(data.livekitUrl, data.initiatorToken);
        await room.localParticipant.setMicrophoneEnabled(true);
        setStatus("live");
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Failed to start page");
        setActiveId(null);
      }
    },
    [stopTalking],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Controller</h1>
        {me && (
          <button
            onClick={signOut}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
          >
            Sign out
          </button>
        )}
      </div>
      <p className="text-sm text-slate-400">
        {me ? `Signed in as ${me.name}. Hold a room to talk.` : "Hold a room to talk."}
      </p>

      {message && (
        <div className="rounded-lg bg-amber-900/40 px-3 py-2 text-sm text-amber-200">
          {message}
        </div>
      )}

      <ul className="grid gap-3">
        {devices.length === 0 && (
          <li className="text-sm text-slate-500">
            No endpoints paired yet. Open the Endpoint role on a room phone.
          </li>
        )}
        {devices.map((d) => {
          const active = activeId === d.id;
          return (
            <li key={d.id}>
              <button
                className={`w-full select-none rounded-2xl px-6 py-8 text-left text-lg font-medium shadow-lg transition ${
                  active
                    ? "bg-emerald-600"
                    : d.online
                      ? "bg-slate-800 hover:bg-slate-700"
                      : "bg-slate-900 text-slate-500"
                }`}
                disabled={!d.online && !active}
                onPointerDown={() => startPage(d.id)}
                onPointerUp={stopTalking}
                onPointerLeave={() => active && stopTalking()}
              >
                {d.displayName}
                <span className="mt-1 block text-sm font-normal opacity-80">
                  {active
                    ? status === "live"
                      ? "🎙️ On air — talking"
                      : "Connecting…"
                    : d.online
                      ? d.room ?? "Online"
                      : "Offline"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
