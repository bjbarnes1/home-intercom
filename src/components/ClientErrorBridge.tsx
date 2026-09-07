"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/reportError";

/**
 * Installs window-level error hooks so uncaught client failures reach Vercel
 * via /api/telemetry/client-error.
 */
export default function ClientErrorBridge() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message, {
        code: "window.error",
        route: "ClientErrorBridge",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, {
        code: "window.unhandledrejection",
        route: "ClientErrorBridge",
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
