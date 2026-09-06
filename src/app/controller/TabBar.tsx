"use client";

import type { Tab } from "./types";

export default function TabBar({
  tab,
  setTab,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-center border-t border-divider bg-bg px-6 pb-6 pt-2">
      <button
        onClick={() => setTab("home")}
        className={`flex flex-1 flex-col items-center gap-1 ${tab === "home" ? "text-accent" : "text-neutral-500"}`}
      >
        <i className="ph-fill ph-house text-xl" />
        <span className="text-[10px]">Home</span>
      </button>
      <div className="flex flex-1 justify-center">
        <button
          onClick={() => setTab("broadcast")}
          className="-mt-4 grid h-14 w-14 place-items-center rounded-full border border-accent bg-bg text-accent transition hover:bg-accent-900"
          aria-label="Broadcast"
        >
          <i className="ph-fill ph-megaphone-simple text-2xl" />
        </button>
      </div>
      <button
        onClick={() => setTab("reminders")}
        className={`flex flex-1 flex-col items-center gap-1 ${tab === "reminders" ? "text-accent" : "text-neutral-500"}`}
      >
        <i className="ph-fill ph-bell-simple text-xl" />
        <span className="text-[10px]">Reminders</span>
      </button>
    </nav>
  );
}
