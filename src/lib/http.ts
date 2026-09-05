import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth/context";

/**
 * Run a route handler body, translating auth failures into HTTP responses so
 * every protected route stays a one-liner: `return withAuth(async () => {...})`.
 */
export async function withAuth(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }
}
