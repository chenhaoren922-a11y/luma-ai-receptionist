import { getDb } from "@/lib/db/client";
import { checkRateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { getAvailability } from "@/lib/domain/slots";
import { AppError } from "@/lib/errors";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`availability:${ip}`, 60, 60_000);
    if (!limit.ok) {
      throw new AppError("RATE_LIMITED", "Please wait a moment and try again.", 429);
    }

    const url = new URL(request.url);
    const serviceId = url.searchParams.get("serviceId")?.trim();
    const date = url.searchParams.get("date")?.trim();
    if (!serviceId || !date) {
      throw new AppError("MISSING_FIELDS", "serviceId and date are required.");
    }
    const staffId = url.searchParams.get("staffId")?.trim() || undefined;
    const periodRaw = url.searchParams.get("period")?.trim();
    if (periodRaw && !["morning", "afternoon", "evening"].includes(periodRaw)) {
      throw new AppError("INVALID_PERIOD", "period must be morning, afternoon, or evening.");
    }

    const db = getDb();
    const provider = await getGoogleCalendarProvider(db);
    const result = await getAvailability(db, {
      serviceId,
      date,
      staffId,
      period: periodRaw as "morning" | "afternoon" | "evening" | undefined,
      provider,
    });
    return json(result);
  } catch (error) {
    return routeError(error);
  }
}
