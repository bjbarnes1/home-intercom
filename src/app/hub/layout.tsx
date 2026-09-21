import type { Metadata } from "next";
import type { ReactNode } from "react";
import HubRuntime from "./HubRuntime";

export const metadata: Metadata = {
  title: "famOS Hub",
  description: "The family display.",
};

/**
 * The Hub.
 *
 * A real panel: it pairs to the household, heartbeats, holds the LiveKit lobby
 * open, and takes calls, announcements and reminders — the same engine the
 * original wall panel runs, wearing the Hub's screens.
 *
 * /endpoint still exists alongside it while this is proven on hardware. It is
 * the same engine in both, so nothing is duplicated except the presentation,
 * and retiring /endpoint is a deletion rather than a migration.
 *
 * Fluid rather than pinned to the 1280×800 reference, so it fills whatever
 * panel it lands on.
 */
export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="kiosk relative flex h-screen w-full flex-col overflow-hidden"
      style={{ background: "linear-gradient(168deg, #FFFFFF 0%, #EEF2FA 46%, #E6ECF9 100%)" }}
    >
      <HubRuntime>{children}</HubRuntime>
    </div>
  );
}
