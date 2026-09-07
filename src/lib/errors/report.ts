/**
 * Central error capture for home-intercom.
 *
 * Always log structured JSON to stderr so Vercel Runtime Logs / get_runtime_errors
 * can find failures. Prefer this over bare console.error or empty catch blocks.
 */

export type ErrorSeverity = "error" | "warning";

export interface ErrorContext {
  /** Stable machine key, e.g. "announce.tts", "hangup.send". */
  code: string;
  /** Optional human route / feature label. */
  route?: string;
  /** Extra safe fields (no secrets). */
  [key: string]: unknown;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof (error as { code?: unknown }).code !== "undefined"
        ? { code: (error as { code?: unknown }).code }
        : {}),
      ...(typeof (error as { status?: unknown }).status !== "undefined"
        ? { status: (error as { status?: unknown }).status }
        : {}),
    };
  }
  return { message: errorMessage(error) };
}

/**
 * Report a failure. Use for caught errors that are handled (fallback, continue)
 * or unexpected failures before returning a 500.
 */
export function reportError(
  error: unknown,
  context: ErrorContext,
  severity: ErrorSeverity = "error",
): void {
  const payload = {
    hi: "error" as const,
    severity,
    code: context.code,
    route: context.route,
    message: errorMessage(error),
    error: serializeError(error),
    context: Object.fromEntries(
      Object.entries(context).filter(([k]) => k !== "code" && k !== "route"),
    ),
    ts: new Date().toISOString(),
  };

  // Single-line JSON keeps Vercel log search and error clustering useful.
  const line = JSON.stringify(payload);
  if (severity === "warning") {
    console.warn(`[hi:warn] ${line}`);
  } else {
    console.error(`[hi:error] ${line}`);
  }
}

/** Convenience for degraded-but-continuing paths (optional services, best-effort). */
export function reportWarning(error: unknown, context: ErrorContext): void {
  reportError(error, context, "warning");
}
