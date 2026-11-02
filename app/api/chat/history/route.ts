import { getDb } from "@/lib/db/client";
import { getConversation, getMessages } from "@/lib/data/conversations";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId")?.trim();
    if (!sessionId || !/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) {
      return json({ messages: [] });
    }
    const db = getDb();
    const conversation = getConversation(db, sessionId);
    if (!conversation) return json({ messages: [] });
    const messages = getMessages(db, sessionId, 100)
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => {
        let ui: unknown[] = [];
        if (message.uiJson) {
          try {
            const parsed = JSON.parse(message.uiJson) as unknown;
            if (Array.isArray(parsed)) ui = parsed;
          } catch {
            ui = [];
          }
        }
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          ui,
          createdAt: message.createdAt,
        };
      });
    return json({ messages });
  } catch (error) {
    return routeError(error);
  }
}
