import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { adminAppointmentById } from "@/lib/data/admin";
import { appointmentSummary } from "@/lib/data/appointments";
import { getSettings } from "@/lib/data/settings";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { cancelAppointment, syncAppointmentToGoogle } from "@/lib/domain/booking";
import { AppError } from "@/lib/errors";
import { json, readJson, routeError, stringField } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    const id = stringField(body, "id", { required: true, max: 100 });
    const action = stringField(body, "action", { required: true, max: 20 });
    if (!id || !action) throw new AppError("MISSING_FIELDS", "id and action are required.");

    const db = getDb();
    const settings = getSettings(db);
    const appointment = adminAppointmentById(db, id);
    const provider = await getGoogleCalendarProvider(db);

    if (action === "cancel") {
      const result = await cancelAppointment(db, {
        code: appointment.code,
        phone: appointment.phone,
        provider,
        enforceCutoff: false,
        force: true,
      });
      if (!result.ok) throw new AppError("CANCEL_FAILED", result.reason, 409);
      return json({ appointment: appointmentSummary(result.appointment, settings) });
    }

    if (action === "sync") {
      if (!provider) {
        throw new AppError(
          "CALENDAR_NOT_CONNECTED",
          "Connect Google Calendar before syncing an appointment.",
          409,
        );
      }
      const updated = await syncAppointmentToGoogle(db, appointment, provider);
      return json({ appointment: appointmentSummary(updated, settings) });
    }

    throw new AppError("INVALID_ACTION", "Unknown appointment action.");
  } catch (error) {
    return routeError(error);
  }
}
