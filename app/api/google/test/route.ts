import { withNetlifyDatabase } from "@/lib/db/netlify";
import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { AppError } from "@/lib/errors";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  try {
    requireAdmin(request);
    const provider = await getGoogleCalendarProvider(await getDb());
    if (!provider) {
      throw new AppError(
        "CALENDAR_NOT_CONNECTED",
        "Google Calendar is not connected yet.",
        409,
      );
    }
    const result = await provider.testConnection?.();
    return json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}

export const POST = withNetlifyDatabase(handlePOST, true);
