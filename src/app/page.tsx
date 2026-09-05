import Link from "next/link";

/**
 * Role picker. The same PWA serves two roles:
 *  - Controller: a parent's phone that initiates pages/calls/broadcasts.
 *  - Endpoint:   a fixed station (kiosk phone / future touchscreen).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Home Intercom</h1>
        <p className="mt-2 text-sm text-slate-400">
          Page the kids, broadcast to the house, set spoken reminders.
        </p>
      </header>

      <nav className="grid gap-4">
        <Link
          href="/controller"
          className="rounded-2xl bg-sky-600 px-6 py-8 text-center text-lg font-medium shadow-lg transition hover:bg-sky-500"
        >
          📱 Controller
          <span className="mt-1 block text-sm font-normal text-sky-100/80">
            Start a page, call or broadcast
          </span>
        </Link>

        <Link
          href="/endpoint"
          className="rounded-2xl bg-slate-800 px-6 py-8 text-center text-lg font-medium shadow-lg transition hover:bg-slate-700"
        >
          🔊 Endpoint (kiosk)
          <span className="mt-1 block text-sm font-normal text-slate-400">
            Fixed station in a room
          </span>
        </Link>
      </nav>

      <footer className="text-center text-xs text-slate-500">
        Media stays on the home server. No audio is recorded.
      </footer>
    </main>
  );
}
