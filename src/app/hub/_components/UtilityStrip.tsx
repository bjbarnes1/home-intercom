import Link from "next/link";
import type { Identity } from "@/lib/color/identity";
import Avatar from "./Avatar";
import Icon from "./Icon";
import WeatherChip from "./WeatherChip";

/**
 * Hub prototype — Utility Strip.
 *
 * The persistent top band on every Base Layer screen: weather and identity, and
 * nothing else, ever. Both are doors — weather opens the forecast, identity opens
 * the profile switcher.
 *
 * With a profile active the avatar stack collapses to that single avatar, which
 * stays tappable: on a shared device it is the only way to end personal state
 * from the screen that most needs one.
 */
export default function UtilityStrip({
  people,
  active,
  weatherActive,
}: {
  /** The stack shown when nobody is signed in. */
  people?: Identity[];
  /** Signed-in person; collapses the stack to one avatar. */
  active?: { who: Identity; name: string };
  /** True on the weather screen itself, where the chip is the door you came through. */
  weatherActive?: boolean;
}) {
  return (
    <div className="flex h-[72px] flex-none items-center justify-end gap-3 px-8">
      <WeatherChip active={weatherActive} />

      {active ? (
        <Link
          href="/hub/profile"
          aria-label={`${active.name} — switch profile or finish`}
          className="flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 transition-transform active:scale-[0.97]"
          style={{ background: "#0F172A" }}
        >
          <Avatar who={active.who} size={30} ring="rgba(255,255,255,0.4)" />
          <span className="text-xs font-semibold text-white">{active.name}</span>
          <Icon name="chevronDown" size={14} style={{ color: "rgba(255,255,255,0.7)" }} />
        </Link>
      ) : (
        <Link
          href="/hub/profile"
          aria-label="Sign in or switch profile"
          className="flex items-center gap-1 rounded-full py-1.5 pl-1.5 pr-2 transition-transform active:scale-[0.97]"
          style={{ background: "#0F172A" }}
        >
          {(people ?? []).map((who) => (
            <Avatar key={who} who={who} size={30} ring="rgba(255,255,255,0.25)" />
          ))}
          <span className="pl-1.5 pr-0.5 text-xs font-semibold text-white">Sign in</span>
          <Icon name="chevronRight" size={14} style={{ color: "rgba(255,255,255,0.7)" }} />
        </Link>
      )}
    </div>
  );
}
