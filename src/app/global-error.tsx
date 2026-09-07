"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/reportError";

/**
 * App Router global error boundary — last resort UI + telemetry.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      code: "react.global_error",
      route: "global-error",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#161826",
          color: "#e9e9ed",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ color: "#8b8b9c", fontSize: 14 }}>
            The error was reported. You can try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "oklch(0.72 0.125 289)",
              color: "#141221",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
