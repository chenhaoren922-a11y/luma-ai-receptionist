import { getDb } from "@/lib/db/client";
import { appointmentSummary } from "@/lib/data/appointments";
import {
  appendMessage,
  createHandoff,
  updateConversationContext,
} from "@/lib/data/conversations";
import { getSettings } from "@/lib/data/settings";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { cancelAppointment } from "@/lib/domain/booking";
import { json, readJson, routeError, stringField } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const code = stringField(body, "code", { required: true, max: 40 });
    const phone = stringField(body, "phone", { required: true, max: 30 });
    const conversationId = stringField(body, "conversationId", { max: 64 });
    const db = getDb();
    const settings = getSettings(db);
    const provider = await getGoogleCalendarProvider(db);
    const result = await cancelAppointment(db, {
      code: code ?? "",
      phone: phone ?? "",
      provider,
      enforceCutoff: true,
    });

    if (!result.ok) {
      if (conversationId) {
        createHandoff(db, conversationId, result.reason);
        updateConversationContext(db, conversationId, { pendingAction: null });
        appendMessage(db, {
          conversationId,
          role: "assistant",
          content: result.reason,
          ui: [{ type: "handoff", phone: settings.phone, reason: result.reason }],
        });
      }
      return json({
        cancelled: false,
        needsHandoff: true,
        reason: result.reason,
        appointment: appointmentSummary(result.appointment, settings),
      });
    }

    if (conversationId) {
      appendMessage(db, {
        conversationId,
        role: "assistant",
        content: "Your appointment has been cancelled.",
        ui: [
          {
            type: "appointments",
            appointments: [appointmentSummary(result.appointment, settings)],
          },
        ],
      });
    }

    return json({
      cancelled: true,
      googleSynced: result.googleSynced,
      appointment: appointmentSummary(result.appointment, settings),
    });
  } catch (error) {
    return routeError(error);
  }
}
