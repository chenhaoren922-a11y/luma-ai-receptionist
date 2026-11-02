import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { AppError } from "@/lib/errors";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const provider = await getGoogleCalendarProvider(getDb());
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
