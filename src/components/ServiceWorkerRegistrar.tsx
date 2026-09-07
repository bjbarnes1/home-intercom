"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/reportError";

/** Registers the PWA service worker once, client-side. */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      reportClientError(e, {
        code: "sw.register",
        route: "ServiceWorkerRegistrar",
      });
    });
  }, []);
  return null;
}
