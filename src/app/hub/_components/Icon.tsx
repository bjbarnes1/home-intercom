/**
 * Hub prototype — the drawn icon set.
 *
 * One stroke language: 24-unit box, stroke 2, round caps and joins, no fills.
 * Purpose-drawn rather than pulled from an icon font, per the design system's
 * Depth & craft section — a borrowed set is how a product ends up looking like
 * everyone else's dashboard.
 */

import type { SVGProps } from "react";

const PATHS = {
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </>
  ),
  intercom: <path d="M4 6c0-1 1-2 2-2h2l2 4-2 2c1 3 3 5 6 6l2-2 4 2v2c0 1-1 2-2 2C10 20 4 14 4 6z" />,
  messages: <path d="M20.5 12a7.5 7.5 0 0 1-10.6 6.8L4 20.5l1.7-5.1A7.5 7.5 0 1 1 20.5 12z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 2.5v4M16 2.5v4" />
    </>
  ),
  tasks: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1.3 1.3L7.5 5" />
      <path d="M4 12l1.3 1.3 2.2-2.3" />
      <path d="M4 18l1.3 1.3 2.2-2.3" />
    </>
  ),
  reminders: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  more: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  weather: (
    <>
      <circle cx="8.5" cy="7.5" r="3" />
      <path d="M8.5 1.5v1.5M2.5 7.5H4M14.5 7.5H13M4.2 3.2l1.1 1.1M12.8 3.2l-1.1 1.1" />
      <path d="M17 19.5H8.5a3.75 3.75 0 0 1-.4-7.5 5 5 0 0 1 9.4 1.2A3.15 3.15 0 0 1 17 19.5z" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15.5h9.5a4 4 0 0 0 0-8 5.6 5.6 0 0 0-10.6-1A3.6 3.6 0 0 0 7 15.5z" />
      <path d="M9 18.5 8 21M13 18.5 12 21M17 18.5 16 21" />
    </>
  ),
  cloud: <path d="M7 17.5h9.5a4.2 4.2 0 0 0 0-8.4 5.8 5.8 0 0 0-11-1A3.8 3.8 0 0 0 7 17.5z" />,
  repeat: (
    <>
      <path d="M4 10V8.5A3.5 3.5 0 0 1 7.5 5H18" />
      <path d="m15.5 2.5 3 2.5-3 2.5" />
      <path d="M20 14v1.5a3.5 3.5 0 0 1-3.5 3.5H6" />
      <path d="m8.5 21.5-3-2.5 3-2.5" />
    </>
  ),
  snow: (
    <>
      <path d="M7 15.5h9.5a4 4 0 0 0 0-8 5.6 5.6 0 0 0-10.6-1A3.6 3.6 0 0 0 7 15.5z" />
      <path d="M8.5 19h.01M12 20.5h.01M15.5 19h.01M12 17.5h.01" />
    </>
  ),
  storm: (
    <>
      <path d="M7 15.5h9.5a4 4 0 0 0 0-8 5.6 5.6 0 0 0-10.6-1A3.6 3.6 0 0 0 7 15.5z" />
      <path d="m13 16.5-3 3.5h3l-2 3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
    </>
  ),
  wind: (
    <>
      <path d="M3 9h11a3 3 0 1 0-3-3" />
      <path d="M3 14h14a3 3 0 1 1-3 3" />
      <path d="M3 19h6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M4 12.5l4.5 4.5L20 6" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M10 3l1.7 4.8L16.5 9.5l-4.8 1.7L10 16l-1.7-4.8L3.5 9.5l4.8-1.7z" />
      <path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  shirt: <path d="M8.5 3.5 4 5.5v4h3V20h10V9.5h3v-4l-4.5-2a3.5 3.5 0 0 1-7 0z" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  broadcast: (
    <>
      <path d="M5.5 8.5a6 6 0 0 1 13 0" />
      <path d="M2.5 6.5a9.5 9.5 0 0 1 19 0" />
      <circle cx="12" cy="13" r="2.5" />
      <path d="M12 15.5V21" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </>
  ),
  speaker: (
    <>
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  play: <path d="M7 5.5v13L18.5 12z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  prev: (
    <>
      <path d="M19 5.5v13L8.5 12z" />
      <path d="M5 5.5v13" />
    </>
  ),
  next: (
    <>
      <path d="M5 5.5v13L15.5 12z" />
      <path d="M19 5.5v13" />
    </>
  ),
  heart: <path d="M12 20.5 4.5 13a4.8 4.8 0 0 1 7.5-5.9A4.8 4.8 0 0 1 19.5 13z" />,
  shuffle: (
    <>
      <path d="M3.5 7H7c2.5 0 3.7 1.2 5 5s2.5 5 5 5h3.5" />
      <path d="M3.5 17H7c1.4 0 2.4-.4 3.2-1.2M13.8 8.2C14.6 7.4 15.6 7 17 7h3.5" />
      <path d="m18 4.5 2.5 2.5-2.5 2.5M18 14.5l2.5 2.5-2.5 2.5" />
    </>
  ),
  infinity: <path d="M12 12c-1.8-2.4-3.3-3.5-5-3.5a3.5 3.5 0 0 0 0 7c1.7 0 3.2-1.1 5-3.5s3.3-3.5 5-3.5a3.5 3.5 0 0 1 0 7c-1.7 0-3.2-1.1-5-3.5z" />,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  library: (
    <>
      <path d="M5 4v16M9.5 4v16" />
      <path d="m14 4.5 5.5 15" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  shield: (
    <>
      <path d="M12 3l7 3v5.5c0 4-2.9 7.6-7 9-4.1-1.4-7-5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  backspace: (
    <>
      <path d="M9 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-7-7z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  exit: (
    <>
      <path d="M8 5.5H5.5v13H8" />
      <path d="M12 12h9" />
      <path d="m17.5 8 4 4-4 4" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 22, strokeWidth = 2, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
