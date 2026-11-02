import { getDb } from "@/lib/db/client";
import { getAppointmentByCode } from "@/lib/data/appointments";
import { getSettings } from "@/lib/data/settings";
import { buildIcs } from "@/lib/domain/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const db = getDb();
  const appointment = getAppointmentByCode(db, code.toUpperCase());
  if (!appointment) {
    return new Response("Appointment not found.", { status: 404 });
  }
  if (appointment.status === "cancelled") {
    return new Response("This appointment has been cancelled.", { status: 410 });
  }
  const settings = getSettings(db);
  const ics = buildIcs(appointment, settings);
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${appointment.code}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
