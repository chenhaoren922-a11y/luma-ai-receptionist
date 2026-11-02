import { describe, expect, it } from "vitest";

import { ensureConversation } from "@/lib/data/conversations";
import { openDatabase } from "@/lib/db/client";
import {
  cancelAppointment,
  confirmDraft,
  lookupAppointments,
  prepareBooking,
  rescheduleAppointment,
} from "@/lib/domain/booking";
import { zonedDateTimeToUtc } from "@/lib/domain/dates";

import { makeTestDb, TEST_TIMEZONE } from "./helpers";

const now = new Date("2026-11-02T16:00:00.000Z"); // Monday noon, UTC-4
const date = "2026-11-03";

function localIso(day: string, time: string): string {
  return zonedDateTimeToUtc(day, time, TEST_TIMEZONE).toISOString();
}

describe("booking lifecycle", () => {
  it("prepares a draft, confirms it, and finds it by phone", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const prepared = await prepareBooking(db, {
      conversationId: conversation.id,
      serviceId: "svc_test",
      startAt: localIso(date, "15:00"),
      customerName: "Jane Doe",
      phone: "5550002222",
      now,
    });
    expect(prepared.summary.serviceName).toBe("Test Facial");
    expect(prepared.draft.status).toBe("pending");

    const confirmed = await confirmDraft(db, { draftId: prepared.draft.id, now });
    expect(confirmed.appointment.code).toMatch(/^LUMA-[A-Z0-9]{6}$/);
    expect(confirmed.appointment.status).toBe("confirmed");
    expect(confirmed.appointment.customerName).toBe("Jane Doe");

    const found = lookupAppointments(db, { phone: "5550002222" });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(confirmed.appointment.id);
  });

  it("prevents two customers from taking the same slot", async () => {
    const db = makeTestDb();
    const first = ensureConversation(db);
    const second = ensureConversation(db);
    const start = localIso(date, "15:00");

    const draftA = await prepareBooking(db, {
      conversationId: first.id,
      serviceId: "svc_test",
      startAt: start,
      customerName: "First Guest",
      phone: "5550003001",
      now,
    });
    const draftB = await prepareBooking(db, {
      conversationId: second.id,
      serviceId: "svc_test",
      startAt: start,
      customerName: "Second Guest",
      phone: "5550003002",
      now,
    });

    await confirmDraft(db, { draftId: draftA.draft.id, now });
    await expect(confirmDraft(db, { draftId: draftB.draft.id, now })).rejects.toMatchObject({
      code: "SLOT_UNAVAILABLE",
    });
  });

  it("rejects an expired draft", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const prepared = await prepareBooking(db, {
      conversationId: conversation.id,
      serviceId: "svc_test",
      startAt: localIso(date, "15:00"),
      customerName: "Expired Guest",
      phone: "5550003003",
      now,
    });
    db.prepare("UPDATE booking_drafts SET expires_at = ? WHERE id = ?").run(
      new Date(now.getTime() - 60_000).toISOString(),
      prepared.draft.id,
    );
    await expect(confirmDraft(db, { draftId: prepared.draft.id, now })).rejects.toMatchObject({
      code: "DRAFT_EXPIRED",
    });
  });

  it("cancels an appointment outside the cutoff", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const prepared = await prepareBooking(db, {
      conversationId: conversation.id,
      serviceId: "svc_test",
      startAt: localIso(date, "15:00"),
      customerName: "Cancel Guest",
      phone: "5550003004",
      now,
    });
    const confirmed = await confirmDraft(db, { draftId: prepared.draft.id, now });
    const cancelled = await cancelAppointment(db, {
      code: confirmed.appointment.code,
      phone: "5550003004",
      enforceCutoff: true,
      now,
    });
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      expect(cancelled.appointment.status).toBe("cancelled");
    }
  });

  it("requests a human handoff inside the cancellation cutoff", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const sameDay = localIso("2026-11-03", "15:00");
    const noon = new Date("2026-11-03T16:00:00.000Z");
    const prepared = await prepareBooking(db, {
      conversationId: conversation.id,
      serviceId: "svc_test",
      startAt: sameDay,
      customerName: "Late Guest",
      phone: "5550003005",
      now: noon,
    });
    const confirmed = await confirmDraft(db, { draftId: prepared.draft.id, now: noon });
    const cancelled = await cancelAppointment(db, {
      code: confirmed.appointment.code,
      phone: "5550003005",
      enforceCutoff: true,
      now: noon,
    });
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.needsHandoff).toBe(true);
    }
  });

  it("reschedules to another available slot", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    const prepared = await prepareBooking(db, {
      conversationId: conversation.id,
      serviceId: "svc_test",
      startAt: localIso(date, "15:00"),
      customerName: "Move Guest",
      phone: "5550003006",
      now,
    });
    const confirmed = await confirmDraft(db, { draftId: prepared.draft.id, now });
    const moved = await rescheduleAppointment(db, {
      code: confirmed.appointment.code,
      phone: "5550003006",
      newStartAt: localIso(date, "16:00"),
      now,
    });
    expect(moved.appointment.startAt).toBe(localIso(date, "16:00"));
  });

  it("validates phone numbers before creating a draft", async () => {
    const db = makeTestDb();
    const conversation = ensureConversation(db);
    await expect(
      prepareBooking(db, {
        conversationId: conversation.id,
        serviceId: "svc_test",
        startAt: localIso(date, "15:00"),
        customerName: "Bad Phone",
        phone: "123",
        now,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PHONE" });
  });

  it("does not operate on a fresh in-memory database without schema", () => {
    const db = openDatabase(":memory:", { seed: false });
    expect(() => db.prepare("SELECT * FROM services").all()).not.toThrow();
  });
});
