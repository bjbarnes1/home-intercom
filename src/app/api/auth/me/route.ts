import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — the signed-in user, or 401. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
