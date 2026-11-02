import { describe, expect, it } from "vitest";

import { DEFAULT_HOURS, defaultSettings } from "@/lib/db/defaults";
import { buildIcs } from "@/lib/domain/ics";
import type { Appointment, BusinessSettings } from "@/lib/types";

const settings: BusinessSettings = {
  ...defaultSettings(),
  timezone: "Etc/GMT+4",
  hours: DEFAULT_HOURS,
};

const appointment: Appointment = {
  id: "appt_1",
  code: "LUMA-TEST01",
  customerId: "cust_1",
  customerName: "Jane Doe",
  phone: "5550000001",
  serviceId: "svc_test",
  serviceName: "Test Facial",
  priceCents: 12000,
  currency: "USD",
  staffId: "staff_test",
  staffName: "Test Artist",
  startAt: "2026-11-03T19:00:00.000Z",
  endAt: "2026-11-03T20:00:00.000Z",
  bufferMin: 10,
  status: "confirmed",
  source: "ai",
  notes: "First visit",
  googleEventId: null,
  googleCalendarId: null,
  syncStatus: "local_only",
  createdAt: "2026-11-02T16:00:00.000Z",
  updatedAt: "2026-11-02T16:00:00.000Z",
};

describe("ICS export", () => {
  it("writes a valid one-event calendar with UTC times", () => {
    const ics = buildIcs(appointment, settings);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261103T190000Z");
    expect(ics).toContain("DTEND:20261103T200000Z");
    expect(ics).toContain("UID:LUMA-TEST01@luma-receptionist.local");
    expect(ics).toContain("LOCATION:88 Harbour Lane");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("5550000001");
  });
});
