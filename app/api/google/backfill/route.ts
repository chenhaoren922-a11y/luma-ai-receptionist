import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { listAppointments } from "@/lib/data/appointments";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { syncAppointmentToGoogle } from "@/lib/domain/booking";
import { AppError } from "@/lib/errors";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    const provider = await getGoogleCalendarProvider(db);
    if (!provider) {
      throw new AppError(
        "CALENDAR_NOT_CONNECTED",
        "Connect Google Calendar before backfilling appointments.",
        409,
      );
    }

    const appointments = listAppointments(db, {
      from: new Date().toISOString(),
      status: "confirmed",
      limit: 500,
    }).filter((appointment) => !appointment.googleEventId);

    let synced = 0;
    const errors: string[] = [];
    for (const appointment of appointments) {
      try {
        await syncAppointmentToGoogle(db, appointment, provider);
        synced += 1;
      } catch (error) {
        errors.push(
          `${appointment.code}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    return json({ synced, failed: errors.length, errors: errors.slice(0, 10) });
  } catch (error) {
    return routeError(error);
  }
}
