import { describe, expect, it } from "vitest";

import {
  buildGoogleEventBody,
  mapGoogleEventToBusy,
  type GoogleEvent,
} from "@/lib/calendar/google";

const eventInput = {
  summary: "Appointment · Test Facial · Jane Doe",
  description: "Booking code: LUMA-TEST01\nPhone: (555) 000-0001",
  location: "88 Harbour Lane, Suite 2",
  startAt: "2026-11-03T19:00:00.000Z",
  endAt: "2026-11-03T20:00:00.000Z",
  timezone: "Etc/GMT+4",
  bookingCode: "LUMA-TEST01",
  serviceId: "svc_test",
  staffId: "staff_test",
  customerName: "Jane Doe",
  phone: "5550000001",
  notes: "First visit",
};

describe("Google Calendar mapping", () => {
  it("builds a tagged event body with reminders", () => {
    const body = buildGoogleEventBody(eventInput);
    expect(body.summary).toContain("Test Facial");
    expect(body.start).toEqual({
      dateTime: "2026-11-03T19:00:00.000Z",
      timeZone: "Etc/GMT+4",
    });
    expect(body.extendedProperties.private).toMatchObject({
      aiReceptionist: "1",
      bookingCode: "LUMA-TEST01",
      staffId: "staff_test",
    });
    expect(body.reminders.overrides).toHaveLength(2);
    expect(body.transparency).toBe("opaque");
  });

  it("ignores events created by this app", () => {
    const event: GoogleEvent = {
      start: { dateTime: "2026-11-03T19:00:00Z" },
      end: { dateTime: "2026-11-03T20:00:00Z" },
      extendedProperties: { private: { aiReceptionist: "1" } },
    };
    expect(mapGoogleEventToBusy(event)).toBeNull();
  });

  it("maps an external all-day event to a full-day block", () => {
    const event: GoogleEvent = {
      start: { date: "2026-11-04" },
      end: { date: "2026-11-05" },
      summary: "Studio closed",
    };
    const busy = mapGoogleEventToBusy(event);
    expect(busy).toMatchObject({
      allDay: true,
      localDate: "2026-11-04",
      localEndDate: "2026-11-05",
      source: "external",
    });
  });

  it("maps an external timed event and keeps a staff filter", () => {
    const event: GoogleEvent = {
      start: { dateTime: "2026-11-03T15:00:00-04:00" },
      end: { dateTime: "2026-11-03T16:00:00-04:00" },
      extendedProperties: { private: { staffId: "staff_test" } },
    };
    const busy = mapGoogleEventToBusy(event);
    expect(busy?.staffId).toBe("staff_test");
    expect(busy?.startAt).toBe("2026-11-03T19:00:00.000Z");
  });

  it("ignores transparent and cancelled events", () => {
    expect(
      mapGoogleEventToBusy({
        transparency: "transparent",
        start: { dateTime: "2026-11-03T15:00:00Z" },
        end: { dateTime: "2026-11-03T16:00:00Z" },
      }),
    ).toBeNull();
    expect(
      mapGoogleEventToBusy({
        status: "cancelled",
        start: { dateTime: "2026-11-03T15:00:00Z" },
        end: { dateTime: "2026-11-03T16:00:00Z" },
      }),
    ).toBeNull();
  });
});
