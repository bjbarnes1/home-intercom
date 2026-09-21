import type { Metadata } from "next";
import type { ReactNode } from "react";
import HubRuntime from "./HubRuntime";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND.panel,
  description: "The family display.",
};

/**
 * The Hub.
 *
 * A real panel: it pairs to the household, heartbeats, holds the LiveKit lobby
 * open, and takes calls, announcements and reminders — the same engine the
 * original wall panel ran, wearing the Hub's screens.
 *
 * It is the only panel now — /endpoint was deleted once this was running on
 * hardware. Four of that panel's sections have no Hub screen yet and their
 * routes are still there waiting for one: see docs/handoff/hub-gaps.md.
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
