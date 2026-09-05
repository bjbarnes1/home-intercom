"use client";

import { useEffect } from "react";

/** Registers the PWA service worker once, client-side. */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort; app still works without it */
    });
  }, []);
  return null;
}
