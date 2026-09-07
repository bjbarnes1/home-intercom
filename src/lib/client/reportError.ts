"use client";

/**
 * Client-side error capture. Logs locally and best-effort posts to the server
 * so wall-panel / controller failures show up in Vercel runtime logs.
 */

import { errorMessage, type ErrorContext } from "@/lib/errors/report";

export function reportClientError(error: unknown, context: ErrorContext): void {
  const message = errorMessage(error);
  const payload = {
    hi: "client-error",
    code: context.code,
    route: context.route,
    message,
    context: Object.fromEntries(
      Object.entries(context).filter(([k]) => k !== "code" && k !== "route"),
    ),
    stack: error instanceof Error ? error.stack : undefined,
    href: typeof window !== "undefined" ? window.location.href : undefined,
    ts: new Date().toISOString(),
  };

  console.error(`[hi:client-error] ${JSON.stringify(payload)}`);

  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      code: context.code,
      route: context.route,
      message: message.slice(0, 500),
      stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
      href: window.location.href,
      context: payload.context,
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/telemetry/client-error", blob);
      return;
    }
    void fetch("/api/telemetry/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* telemetry must never throw */
    });
  } catch {
    /* telemetry must never throw */
  }
}
