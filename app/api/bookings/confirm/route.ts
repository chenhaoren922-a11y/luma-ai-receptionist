import { getDb } from "@/lib/db/client";
import { appendMessage, updateConversationContext, updateConversationCustomer } from "@/lib/data/conversations";
import { getSettings } from "@/lib/data/settings";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import { confirmDraft } from "@/lib/domain/booking";
import { AppError } from "@/lib/errors";
import { json, readJson, routeError, stringField } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const draftId = stringField(body, "draftId", { required: true, max: 100 });
    if (!draftId) throw new AppError("MISSING_DRAFT", "A draftId is required.");
    const db = getDb();
    const draftRow = db
      .prepare("SELECT conversation_id, status FROM booking_drafts WHERE id = ?")
      .get(draftId) as { conversation_id: string; status: string } | undefined;
    const provider = await getGoogleCalendarProvider(db);
    const result = await confirmDraft(db, { draftId, provider });
    const settings = getSettings(db);

    let message = null;
    if (draftRow) {
      const conversationId = draftRow.conversation_id;
      updateConversationCustomer(
        db,
        conversationId,
        result.appointment.customerName,
        result.appointment.phone,
      );
      const current = db
        .prepare("SELECT context_json FROM conversations WHERE id = ?")
        .get(conversationId) as { context_json: string } | undefined;
      let context: Record<string, unknown> = {};
      try {
        context = current ? (JSON.parse(current.context_json) as Record<string, unknown>) : {};
      } catch {
        context = {};
      }
      updateConversationContext(db, conversationId, {
        ...context,
        lastDraftId: null,
        lastDraftStatus: "confirmed",
        lastAppointmentCode: result.appointment.code,
        pendingAction: null,
      });
      if (draftRow.status !== "confirmed") {
        message = appendMessage(db, {
          conversationId,
          role: "assistant",
          content: `Your appointment is confirmed. The booking code is ${result.appointment.code}.`,
          ui: [
            {
              type: "booking",
              appointment: result.summary,
              icsUrl: `/api/ics/${result.appointment.code}`,
            },
          ],
        });
      }
    }

    return json({
      appointment: result.summary,
      googleSynced: result.googleSynced,
      message: message
        ? { id: message.id, role: "assistant", content: message.content }
        : null,
      business: {
        address: settings.address,
        phone: settings.phone,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
