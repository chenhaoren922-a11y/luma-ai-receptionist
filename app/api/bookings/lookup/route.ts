import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/data/settings";
import { appointmentSummary } from "@/lib/data/appointments";
import { lookupAppointments } from "@/lib/domain/booking";
import { json, readJson, routeError, stringField } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const phone = stringField(body, "phone", { required: true, max: 30 });
    const code = stringField(body, "code", { max: 40 });
    const db = getDb();
    const settings = getSettings(db);
    const appointments = lookupAppointments(db, { phone: phone ?? "", code });
    return json({
      appointments: appointments.map((appointment) => appointmentSummary(appointment, settings)),
    });
  } catch (error) {
    return routeError(error);
  }
}
