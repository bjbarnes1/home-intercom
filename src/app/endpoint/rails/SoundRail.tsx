"use client";

import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useAppTheme } from "@/components/ThemeProvider";
import type { EtiquetteSettings } from "../useEndpointPresence";

interface Props {
  dnd: boolean;
  onDndChange: (value: boolean) => void;
  etiquette: EtiquetteSettings;
  onEtiquetteChange: (patch: Partial<EtiquetteSettings>) => void;
}

/**
 * Per-device etiquette. DND, chime, and quiet hours persist via settings API.
 * Theme is a room/panel preference (dark / light / auto via ambient light).
 */
export default function SoundRail({
  dnd,
  onDndChange,
  etiquette,
  onEtiquetteChange,
}: Props) {
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
            Pages still ring; reminders wait. Front LED soft-pulses when DND is
            on{etiquette.hasLeds ? "" : " (when LED hardware is present)"}.
          </div>
        </div>
        <Toggle on={dnd} onChange={onDndChange} label="Do not disturb" />
      </div>

      <div className="card mb-4 flex items-center gap-4 p-4">
        <i className="ph ph-bell-ringing text-2xl text-accent" />
        <div className="flex-1">
          <div className="font-heading text-lg font-medium">Chime before speak</div>
          <div className="text-[13px] text-neutral-500">
            Soft beep before announces and reminders so the room notices.
          </div>
        </div>
        <Toggle
          on={etiquette.chimeEnabled}
          onChange={(v) => onEtiquetteChange({ chimeEnabled: v })}
          label="Chime before speak"
        />
      </div>

      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center gap-4">
          <i className="ph ph-moon-stars text-2xl text-accent" />
          <div className="flex-1">
            <div className="font-heading text-lg font-medium">Quiet hours</div>
            <div className="text-[13px] text-neutral-500">
              Reminders whisper (no chime, quieter). Pages and calls still ring.
            </div>
          </div>
          <Toggle
            on={etiquette.quietHoursEnabled}
            onChange={(v) => onEtiquetteChange({ quietHoursEnabled: v })}
            label="Quiet hours"
          />
        </div>
        {etiquette.quietHoursEnabled && (
          <div className="ml-11 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-neutral-400">
              From
              <input
                type="time"
                value={etiquette.quietHoursStart}
                onChange={(e) =>
                  onEtiquetteChange({ quietHoursStart: e.target.value })
                }
                className="rounded-md border border-divider bg-surface px-2 py-1 text-neutral-200"
              />
            </label>
            <label className="flex items-center gap-2 text-neutral-400">
              Until
              <input
                type="time"
                value={etiquette.quietHoursEnd}
                onChange={(e) =>
                  onEtiquetteChange({ quietHoursEnd: e.target.value })
                }
                className="rounded-md border border-divider bg-surface px-2 py-1 text-neutral-200"
              />
            </label>
          </div>
        )}
      </div>

      <div className="card mb-4 p-4">
        <div className="mb-3 flex items-center gap-4">
          <i className="ph ph-timer text-2xl text-accent" />
          <div className="flex-1">
            <div className="font-heading text-lg font-medium">
              Message display time
            </div>
            <div className="text-[13px] text-neutral-500">
              How long announces and reminders stay full-screen before returning
              home. The top colour bar counts down.
            </div>
          </div>
          <div className="font-heading text-lg font-medium tabular-nums text-accent">
            {etiquette.announceDwellSec}s
          </div>
        </div>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={etiquette.announceDwellSec}
          onChange={(e) =>
            onEtiquetteChange({ announceDwellSec: Number(e.target.value) })
          }
          className="w-full accent-[var(--color-accent)]"
          aria-label="Message display time in seconds"
        />
        <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
          <span>5s</span>
          <span>30s default</span>
          <span>120s</span>
        </div>
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

      <div className="card mb-4 flex items-center gap-4 p-4">
        <i className="ph ph-lightbulb text-2xl text-accent" />
        <div className="flex-1">
          <div className="font-heading text-lg font-medium">LED bars fitted</div>
          <div className="text-[13px] text-neutral-500">
            Advertise front/rear LED capability so the house can send cue
            commands to this panel.
          </div>
        </div>
        <Toggle
          on={etiquette.hasLeds}
          onChange={(v) => onEtiquetteChange({ hasLeds: v })}
          label="LED bars fitted"
        />
      </div>

      <div className="card p-4 text-[13px] text-neutral-400">
        <div className="font-heading mb-1 text-base font-medium text-neutral-200">
          Coming with the room device
        </div>
        <ul className="m-0 list-disc space-y-1 pl-4">
          <li>Half duplex (open-room feedback control)</li>
        </ul>
      </div>
    </div>
  );
}
