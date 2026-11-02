import { describe, expect, it } from "vitest";

import type { CalendarProvider } from "@/lib/calendar/types";
import {
  checkSlotAvailability,
  getAvailability,
} from "@/lib/domain/slots";
import { zonedDateTimeToUtc } from "@/lib/domain/dates";

import { insertAppointment, makeTestDb, TEST_TIMEZONE } from "./helpers";

const now = new Date("2026-11-02T16:00:00.000Z"); // Monday noon, UTC-4
const date = "2026-11-03"; // Tuesday

function localIso(day: string, time: string): string {
  return zonedDateTimeToUtc(day, time, TEST_TIMEZONE).toISOString();
}

describe("availability engine", () => {
  it("generates slots inside opening hours and skips the daily break", async () => {
    const db = makeTestDb();
    const result = await getAvailability(db, {
      serviceId: "svc_test",
      date,
      now,
      limit: 30,
    });
    expect(result.slots.length).toBeGreaterThan(5);
    expect(result.slots[0].startLocal).toBe("2026-11-03T10:00");
    expect(result.slots.some((slot) => slot.startLocal.endsWith("T13:00"))).toBe(false);
    expect(result.slots.some((slot) => slot.startLocal.endsWith("T13:30"))).toBe(false);
  });

  it("does not offer a slot that collides with an existing booking and its buffer", async () => {
    const db = makeTestDb();
    insertAppointment(db, {
      id: "appt_busy",
      code: "LUMA-BUSY1",
      customer: "Busy Guest",
      phone: "5550001111",
      startAt: localIso(date, "11:00"),
      endAt: localIso(date, "12:00"),
    });
    const result = await getAvailability(db, {
      serviceId: "svc_test",
      date,
      now,
      limit: 30,
    });
    const starts = result.slots.map((slot) => slot.startLocal);
    expect(starts).not.toContain("2026-11-03T10:00");
    expect(starts).not.toContain("2026-11-03T11:00");
    expect(starts).not.toContain("2026-11-03T12:00");
    expect(starts).toContain("2026-11-03T14:00");
  });

  it("returns no slots on a closed day", async () => {
    const db = makeTestDb();
    const result = await getAvailability(db, {
      serviceId: "svc_test",
      date: "2026-11-02",
      now,
    });
    expect(result.closed).toBe(true);
    expect(result.slots).toHaveLength(0);
  });

  it("enforces the lead time", async () => {
    const db = makeTestDb();
    const afternoon = new Date("2026-11-03T16:00:00.000Z"); // 12:00 local
    const result = await getAvailability(db, {
      serviceId: "svc_test",
      date,
      now: afternoon,
      limit: 30,
    });
    const starts = result.slots.map((slot) => slot.startLocal);
    expect(starts).toContain("2026-11-03T14:00");
    expect(starts).not.toContain("2026-11-03T13:00");
    expect(starts).not.toContain("2026-11-03T12:00");
  });

  it("blocks time occupied by an external Google event", async () => {
    const db = makeTestDb();
    const provider: CalendarProvider = {
      kind: "google",
      isConnected: () => true,
      listBusy: async () => [
        {
          startAt: localIso(date, "15:00"),
          endAt: localIso(date, "16:00"),
          source: "external",
          staffId: null,
        },
      ],
      createEvent: async () => ({ id: "evt" }),
      updateEvent: async () => undefined,
      deleteEvent: async () => undefined,
    };
    const result = await getAvailability(db, {
      serviceId: "svc_test",
      date,
      now,
      provider,
      limit: 30,
    });
    const starts = result.slots.map((slot) => slot.startLocal);
    expect(starts).not.toContain("2026-11-03T15:00");
    expect(starts).not.toContain("2026-11-03T15:30");
  });

  it("checks an exact slot and returns the assigned team member", async () => {
    const db = makeTestDb();
    const result = await checkSlotAvailability(db, {
      serviceId: "svc_test",
      startAt: localIso(date, "15:00"),
      now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.staff.name).toBe("Test Artist");
    }
  });

  it("rejects a slot outside opening hours", async () => {
    const db = makeTestDb();
    const result = await checkSlotAvailability(db, {
      serviceId: "svc_test",
      startAt: localIso(date, "20:00"),
      now,
    });
    expect(result.ok).toBe(false);
  });
});
