import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "famOS Hub",
  description: "The ambient family display, as designed.",
};

/**
 * Hub prototype.
 *
 * A walkthrough of the FamOS Hub screens running in the real app, so they can be
 * opened on the actual panel (and on the fridge) before any of them is wired to
 * live data. Fixture data lives in ./data.ts and nothing here reads or writes.
 *
 * This sits alongside /endpoint rather than replacing it: /endpoint carries the
 * working intercom, presence and LED behaviour, and swapping it for a prototype
 * would take real features offline.
 *
 * Fluid rather than pinned to the 1280×800 reference, so it fills whatever panel
 * it lands on.
 */
export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="kiosk relative flex h-screen w-full flex-col overflow-hidden"
      style={{ background: "linear-gradient(168deg, #FFFFFF 0%, #EEF2FA 46%, #E6ECF9 100%)" }}
    >
      {children}
    </div>
  );
}
