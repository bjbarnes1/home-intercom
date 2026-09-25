"use client";

import BaseLayer, { Hero } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import { PEOPLE } from "../data";
import DailyAgenda from "./DailyAgenda";
import { useReminders } from "./useReminders";

/**
 * Reminders — the section screen.
 *
 * Today's whole agenda, done and missed included, and the way in to making a
 * new one. Public like Home: it is the household's shared list, not anyone's
 * private one, so it runs with nobody identified.
 */
export default function RemindersScreen() {
  const { openCreate } = useReminders();
  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <Hero title="Reminders" eyebrow="Today, for the whole house">
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[var(--touch-min)] cursor-pointer items-center gap-2.5 rounded-full border-none bg-accent px-6 text-[17px] font-bold text-white"
          style={{ boxShadow: "0 10px 24px rgba(59,92,246,0.28)" }}
        >
          <Icon name="plus" size={22} strokeWidth={2.5} />
          New reminder
        </button>
      </Hero>
      <div className="no-scrollbar min-h-0 flex-grow overflow-y-auto">
        <DailyAgenda variant="full" />
      </div>
    </BaseLayer>
  );
}
