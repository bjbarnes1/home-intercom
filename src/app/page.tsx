import Link from "next/link";

/**
 * Role picker. The same PWA serves two roles:
 *  - Controller: a parent's phone that initiates pages/calls/broadcasts.
 *  - Endpoint:   a fixed station (kiosk phone / wall panel).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-10 p-6">
      <header className="text-center">
        <div className="uplabel text-accent mb-2">Barnes / Wilkes</div>
        <h1 className="m-0 text-3xl">Home Intercom</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm text-neutral-400">
          Page the kids, broadcast to the house, set spoken reminders.
        </p>
      </header>

      <nav className="grid gap-4">
        <Link
          href="/controller"
          className="card card-hover flex items-center gap-4 p-5"
        >
          <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-accent-900 text-accent">
            <i className="ph-fill ph-device-mobile-speaker text-2xl" />
          </span>
          <span className="min-w-0">
            <span className="block font-heading text-lg font-medium">Controller</span>
            <span className="block text-sm text-neutral-500">
              Start a page, call or broadcast
            </span>
          </span>
          <i className="ph ph-caret-right ml-auto text-neutral-600" />
        </Link>

        <Link
          href="/endpoint"
          className="card card-hover flex items-center gap-4 p-5"
        >
          <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-accent-900 text-accent">
            <i className="ph-fill ph-speaker-high text-2xl" />
          </span>
          <span className="min-w-0">
            <span className="block font-heading text-lg font-medium">
              Endpoint / wall panel
            </span>
            <span className="block text-sm text-neutral-500">
              Fixed station in a room
            </span>
          </span>
          <i className="ph ph-caret-right ml-auto text-neutral-600" />
        </Link>
      </nav>

      <footer className="text-center text-xs text-neutral-600">
        Media stays on the home server. No audio is recorded.
      </footer>
    </main>
  );
}
