"use client";

import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useAppTheme } from "@/components/ThemeProvider";

interface Props {
  dnd: boolean;
  onDndChange: (value: boolean) => void;
}

/**
 * Per-device etiquette. DND persists via the device settings API.
 * Theme is a room/panel preference (dark / light / auto via ambient light).
 */
export default function SoundRail({ dnd, onDndChange }: Props) {
  const { pref, theme, lux } = useAppTheme();

  return (
    <div className="flex-1 overflow-auto px-7 pb-8">
      <h3 className="mb-1 mt-1">Sound</h3>
      <p className="mb-5 text-xs text-neutral-500">
        This panel only. Other rooms keep their own settings.
      </p>
      <div className="card mb-4 flex items-center gap-4 p-4">
        <i className="ph ph-moon text-2xl text-accent" />
        <div className="flex-1">
          <div className="font-heading text-lg font-medium">Do not disturb</div>
          <div className="text-[13px] text-neutral-500">
            Pages still ring; reminders wait. Front LED will soft-pulse when DND
            is on once the room hardware ships.
          </div>
        </div>
        <Toggle on={dnd} onChange={onDndChange} label="Do not disturb" />
      </div>

      <div className="card mb-4 flex items-center gap-4 p-4">
        <i className="ph ph-palette text-2xl text-accent" />
        <div className="flex-1">
          <div className="font-heading text-lg font-medium">Panel theme</div>
          <div className="text-[13px] text-neutral-500">
            {pref === "auto"
              ? `Auto · currently ${theme}${lux ? ` · ${Math.round(lux)} lux` : ""}`
              : `${pref === "light" ? "Light" : "Dark"} ground`}
            . Auto follows this room&apos;s light sensor when available.
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div className="card p-4 text-[13px] text-neutral-400">
        <div className="font-heading mb-1 text-base font-medium text-neutral-200">
          Coming with the room device
        </div>
        <ul className="m-0 list-disc space-y-1 pl-4">
          <li>Chime before someone speaks</li>
          <li>Half duplex (open-room feedback control)</li>
          <li>Quiet hours · whisper reminders, pages still ring</li>
          <li>Front LED cues for ring / open line / reminder</li>
          <li>Rear LED ambience tied to music playback</li>
        </ul>
      </div>
    </div>
  );
}
