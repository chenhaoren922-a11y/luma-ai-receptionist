import { requireAdmin } from "@/lib/auth/admin";
import { disconnectGoogle } from "@/lib/calendar/google";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    await disconnectGoogle();
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
