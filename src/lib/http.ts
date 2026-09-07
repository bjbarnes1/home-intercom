import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth/context";
import { reportError } from "@/lib/errors/report";

/**
 * Run a route handler body, translating auth failures into HTTP responses so
 * every protected route stays a one-liner: `return withAuth(async () => {...})`.
 * Unexpected errors are reported and returned as a safe 500 JSON body.
 */
export async function withAuth(
  fn: () => Promise<NextResponse>,
  meta?: { route?: string },
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    reportError(e, {
      code: "api.unhandled",
      route: meta?.route ?? "withAuth",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Same capture for routes that are not session-auth (cron, device secret, login).
 */
export async function withRoute(
  fn: () => Promise<NextResponse>,
  meta: { route: string },
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    reportError(e, {
      code: "api.unhandled",
      route: meta.route,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
