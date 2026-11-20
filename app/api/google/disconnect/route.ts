import { withNetlifyDatabase } from "@/lib/db/netlify";
import { requireAdmin } from "@/lib/auth/admin";
import { disconnectGoogle } from "@/lib/calendar/google";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  try {
    requireAdmin(request);
    await disconnectGoogle();
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}

export const POST = withNetlifyDatabase(handlePOST, true);
