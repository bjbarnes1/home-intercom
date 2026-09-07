"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { identStyle } from "@/lib/color/identity";
import ThemeToggle from "@/components/ThemeToggle";
import DevicesManager from "./DevicesManager";
import TabBar from "./TabBar";
import PageTalk from "./PageTalk";
import Broadcast from "./Broadcast";
import RemindersPanel from "./RemindersPanel";
import HouseholdPanel from "./HouseholdPanel";
import type { DeviceRow, Tab, ZoneRow } from "./types";
import { roomIcon } from "./types";

export default function ControllerPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [pageTarget, setPageTarget] = useState<DeviceRow | null>(null);
  const [showDevices, setShowDevices] = useState(false);

  const load = useCallback(async () => {
    const [dRes, zRes] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/zones"),
    ]);
    if (dRes.status === 401 || zRes.status === 401) {
      router.replace("/login");
      return;
    }
    const d = await dRes.json();
    const z = await zRes.json();
    setDevices((d.devices ?? []).filter((x: DeviceRow) => x.type === "ENDPOINT"));
    setZones(z.zones ?? []);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) return router.replace("/login");
      const data = await res.json();
      if (!cancelled) setMe(data.user);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [me, load]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  const onlineCount = devices.filter((d) => d.online).length;

  if (showDevices) {
    return <DevicesManager onBack={() => setShowDevices(false)} />;
  }

  if (pageTarget) {
    return <PageTalk target={pageTarget} onBack={() => setPageTarget(null)} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <main className="flex-1 overflow-auto p-5 pb-24">
        {tab === "home" && (
          <>
            <header className="mb-5 flex items-end justify-between">
              <div>
                <h1 className="m-0 text-2xl">Home</h1>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {onlineCount} of {devices.length} endpoints online
                </div>
              </div>
              <div className="flex gap-2">
                <ThemeToggle />
                <button
                  onClick={() => setShowDevices(true)}
                  className="btn btn-secondary min-h-9 px-2.5 text-xs"
                  aria-label="Manage devices"
                >
                  <i className="ph ph-devices" />
                </button>
                <button onClick={signOut} className="btn btn-secondary min-h-9 text-xs">
                  <i className="ph ph-sign-out" />
                  {me?.name ?? "Sign out"}
                </button>
              </div>
            </header>

            <div className="uplabel mb-2">Zones</div>
            <div className="mb-6 flex gap-2">
              {zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setTab("broadcast")}
                  className="hi-tinted card card-hover flex-1 p-3 text-left"
                  style={identStyle(z.name)}
                >
                  <div
                    className="font-heading text-[15px] font-medium"
                    style={{ color: "var(--hi-ident)" }}
                  >
                    {z.name}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {z.deviceCount} {z.deviceCount === 1 ? "room" : "rooms"}
                  </div>
                </button>
              ))}
              {zones.length === 0 && (
                <div className="text-sm text-neutral-600">No zones yet.</div>
              )}
            </div>

            <div className="uplabel mb-2">Around the house</div>
            <div className="flex flex-col gap-1.5">
              {devices.map((d) => (
                <button
                  key={d.id}
                  disabled={!d.online}
                  onClick={() => setPageTarget(d)}
                  className="hi-tinted card card-hover flex items-center gap-3 p-3 disabled:cursor-default disabled:opacity-55"
                  style={identStyle(d.displayName)}
                >
                  <i
                    className={`ph ${roomIcon(d.displayName)} text-lg`}
                    style={{ color: "var(--hi-ident)" }}
                  />
                  <span className="flex-1 text-left font-heading text-[15px] font-medium">
                    {d.displayName}
                  </span>
                  <span
                    className={`dot ${d.online ? "dot-ident" : "dot-offline"}`}
                  />
                  <span className="text-[11px] text-neutral-500">
                    {d.online ? "Online" : "Offline"}
                  </span>
                  <i className="ph ph-caret-right text-neutral-600" />
                </button>
              ))}
              {devices.length === 0 && (
                <div className="text-sm text-neutral-600">
                  No endpoints paired yet.
                </div>
              )}
            </div>
          </>
        )}

        {tab === "broadcast" && <Broadcast zones={zones} />}
        {tab === "reminders" && <RemindersPanel zones={zones} devices={devices} />}
        {tab === "household" && <HouseholdPanel devices={devices} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
