import type { Db } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { getServices, getFaqs } from "@/lib/data/catalog";
import {
  appendMessage,
  ensureConversation,
  getRecentMessages,
  updateConversationContext,
} from "@/lib/data/conversations";
import { getSettings } from "@/lib/data/settings";
import { getGoogleCalendarProvider } from "@/lib/calendar/google";
import type { ChatResponse, UiBlock } from "@/lib/types";
import { AppError, errorResponse } from "@/lib/errors";

import { isConfirmationUtterance } from "./confirmation";
import {
  callChatModel,
  modelMode,
  type ModelMessage,
} from "./provider";
import { handleFallback } from "./fallback";
import { buildSystemPrompt } from "./prompt";
import { executeTool, TOOL_DEFINITIONS } from "./tools";

const MAX_TOOL_ROUNDS = 4;
const MAX_MESSAGE_LENGTH = 2000;

function asUiBlocks(ui: UiBlock[] | undefined): UiBlock[] {
  if (!ui?.length) return [];
  const seen = new Set<string>();
  return ui.filter((block) => {
    const key = `${block.type}:${JSON.stringify(block).slice(0, 120)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The chat surface is plain text, so remove common Markdown emphasis markers. */
function cleanAssistantText(text: string): string {
  return text
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .trim();
}

export async function handleChat(input: {
  db?: Db;
  sessionId?: string;
  message: string;
}): Promise<ChatResponse> {
  const db = input.db ?? getDb();
  const message = input.message.trim();
  if (!message) {
    throw new AppError("EMPTY_MESSAGE", "Please type a message.");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(
      "MESSAGE_TOO_LONG",
      `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`,
    );
  }

  const conversation = ensureConversation(db, input.sessionId);
  appendMessage(db, {
    conversationId: conversation.id,
    role: "user",
    content: message,
  });

  const mode = modelMode();
  if (mode === "fallback") {
    const fallback = await handleFallback(db, conversation, message);
    const saved = appendMessage(db, {
      conversationId: conversation.id,
      role: "assistant",
      content: fallback.content,
      ui: fallback.ui,
    });
    return {
      sessionId: conversation.id,
      message: {
        id: saved.id,
        role: "assistant",
        content: saved.content,
        ui: fallback.ui ?? [],
      },
      mode: "fallback",
    };
  }

  const settings = getSettings(db);
  const services = getServices(db);
  const faqs = getFaqs(db);
  const provider = await getGoogleCalendarProvider(db);
  const history = getRecentMessages(db, conversation.id, 20);
  let runtimeContext: Record<string, unknown> = { ...conversation.context };

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        settings,
        services,
        faqs,
        context: runtimeContext,
      }),
    },
    ...history
      .filter((entry) => entry.role === "user" || entry.role === "assistant")
      .map<ModelMessage>((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
  ];

  try {
    let collectedUi: UiBlock[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const assistant = await callChatModel(messages, TOOL_DEFINITIONS);
      if (!assistant.tool_calls?.length) {
        const content = cleanAssistantText(
          assistant.content?.trim() ||
            (collectedUi.length
              ? "Here are the details."
              : "I'm here to help with services, availability, and bookings. What would you like to do?"),
        );
        updateConversationContext(db, conversation.id, runtimeContext);
        const saved = appendMessage(db, {
          conversationId: conversation.id,
          role: "assistant",
          content,
          ui: collectedUi,
        });
        return {
          sessionId: conversation.id,
          message: {
            id: saved.id,
            role: "assistant",
            content,
            ui: asUiBlocks(collectedUi),
          },
          mode: "live",
        };
      }

      messages.push(assistant);

      for (const toolCall of assistant.tool_calls) {
        let args: unknown = {};
        try {
          args = toolCall.function.arguments
            ? JSON.parse(toolCall.function.arguments)
            : {};
        } catch {
          args = {};
        }
        const execution = await executeTool(toolCall.function.name, args, {
          db,
          conversationId: conversation.id,
          userText: message,
          isConfirmation: isConfirmationUtterance(message),
          provider,
          settings,
          context: runtimeContext,
        });
        if (execution.contextPatch) {
          runtimeContext = { ...runtimeContext, ...execution.contextPatch };
        }
        collectedUi = [...collectedUi, ...(execution.ui ?? [])];
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(execution.result),
        });
      }
    }

    updateConversationContext(db, conversation.id, runtimeContext);
    const fallback = await handleFallback(db, conversation, message, provider);
    const saved = appendMessage(db, {
      conversationId: conversation.id,
      role: "assistant",
      content: cleanAssistantText(fallback.content),
      ui: fallback.ui,
    });
    return {
      sessionId: conversation.id,
      message: {
        id: saved.id,
        role: "assistant",
        content: saved.content,
        ui: asUiBlocks(fallback.ui),
      },
      mode: "degraded",
    };
  } catch (error) {
    console.error("[chat] live AI failed:", error instanceof Error ? error.message : error);
    try {
      const fallback = await handleFallback(db, conversation, message, provider);
      const saved = appendMessage(db, {
        conversationId: conversation.id,
        role: "assistant",
        content: cleanAssistantText(fallback.content),
        ui: fallback.ui,
      });
      return {
        sessionId: conversation.id,
        message: {
          id: saved.id,
          role: "assistant",
          content: saved.content,
          ui: asUiBlocks(fallback.ui),
        },
        mode: "degraded",
      };
    } catch (fallbackError) {
      const response = errorResponse(fallbackError);
      const content =
        "I'm having trouble reaching the booking service. Please try again, or call the studio and a person will help.";
      const saved = appendMessage(db, {
        conversationId: conversation.id,
        role: "assistant",
        content,
        ui: [
          {
            type: "handoff",
            phone: settings.phone,
            reason: response.body.error.message,
          },
        ],
      });
      return {
        sessionId: conversation.id,
        message: {
          id: saved.id,
          role: "assistant",
          content,
          ui: [
            {
              type: "handoff",
              phone: settings.phone,
              reason: response.body.error.message,
            },
          ],
        },
        mode: "degraded",
      };
    }
  }
}
