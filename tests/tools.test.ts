import { describe, expect, it } from "vitest";

import { executeTool, TOOL_DEFINITIONS, type ToolContext } from "@/lib/ai/tools";
import { ensureConversation } from "@/lib/data/conversations";
import { getSettings } from "@/lib/data/settings";
import {
  addDaysToDateKey,
  dateKeyInZone,
  formatLongDate,
} from "@/lib/domain/dates";

import { makeTestDb, TEST_TIMEZONE } from "./helpers";

function context(db: ReturnType<typeof makeTestDb>, conversationId: string): ToolContext {
  return {
    db,
    conversationId,
    userText: "",
    isConfirmation: false,
    provider: null,
    settings: getSettings(db),
    context: {},
  };
}

describe("AI tool layer", () => {
  it("publishes a JSON-schema function for every tool", () => {
    const names = TOOL_DEFINITIONS.map((tool) => tool.function.name);
    expect(names).toContain("list_services");
    expect(names).toContain("get_availability");
    expect(names).toContain("prepare_booking");
    expect(names).toContain("confirm_booking");
    expect(names).toContain("request_handoff");
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.function.parameters).toHaveProperty("type", "object");
    }
  });

  it("lists services with a rich UI block", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const result = await executeTool("list_services", {}, context(db, conversation.id));
    expect(result.result.ok).toBe(true);
    expect(result.ui?.[0]?.type).toBe("services");
  });

  it("returns real slots for a future date", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const today = dateKeyInZone(new Date(), TEST_TIMEZONE);
    const date = addDaysToDateKey(today, 1, TEST_TIMEZONE);
    const result = await executeTool(
      "get_availability",
      { serviceId: "svc_test", date },
      context(db, conversation.id),
    );
    expect(result.result.ok).toBe(true);
    expect(result.result.dateLabel).toBe(formatLongDate(date, TEST_TIMEZONE));
    expect(result.ui?.[0]?.type).toBe("slots");
  });

  it("requires an explicit confirmation before booking", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const today = dateKeyInZone(new Date(), TEST_TIMEZONE);
    const date = addDaysToDateKey(today, 2, TEST_TIMEZONE);
    const ctx = context(db, conversation.id);
    const prepared = await executeTool(
      "prepare_booking",
      {
        serviceId: "svc_test",
        start: `${date}T15:00`,
        customerName: "Tool Guest",
        phone: "5550007777",
      },
      ctx,
    );
    expect(prepared.result.ok).toBe(true);
    const draftId = String(prepared.result.draftId);
    expect(draftId).toMatch(/^draft_/);

    const blocked = await executeTool("confirm_booking", { draftId }, ctx);
    expect(blocked.result).toMatchObject({ ok: false, code: "CONFIRMATION_REQUIRED" });

    const confirmed = await executeTool(
      "confirm_booking",
      { draftId },
      { ...ctx, isConfirmation: true, context: { lastDraftId: draftId } },
    );
    expect(confirmed.result.ok).toBe(true);
    expect(confirmed.ui?.[0]?.type).toBe("booking");
  });
});
