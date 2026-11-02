import { describe, expect, it } from "vitest";

import { DEFAULT_HOURS } from "@/lib/db/defaults";
import {
  parseDateTime,
  timezoneLabel,
  zonedDateTimeToUtc,
} from "@/lib/domain/dates";

const now = new Date("2026-11-02T16:00:00.000Z"); // Monday, 12:00 PM in UTC-4
const timezone = "Etc/GMT+4";

describe("English date and time parsing", () => {
  it("parses tomorrow at 3 PM", () => {
    const result = parseDateTime("tomorrow at 3 PM", {
      now,
      timezone,
      hours: DEFAULT_HOURS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date).toBe("2026-11-03");
    expect(result.time).toBe("15:00");
    expect(result.hasExplicitTime).toBe(true);
  });

  it("parses an explicit month and day", () => {
    const result = parseDateTime("November 5 at 10:30 AM", {
      now,
      timezone,
      hours: DEFAULT_HOURS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date).toBe("2026-11-05");
    expect(result.time).toBe("10:30");
  });

  it("captures a period without inventing a time", () => {
    const result = parseDateTime("tomorrow afternoon", {
      now,
      timezone,
      hours: DEFAULT_HOURS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date).toBe("2026-11-03");
    expect(result.period).toBe("afternoon");
    expect(result.hasExplicitTime).toBe(false);
  });

  it("resolves an ambiguous 3 to 3 PM when the studio is open", () => {
    const result = parseDateTime("tomorrow at 3", {
      now,
      timezone,
      hours: DEFAULT_HOURS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.time).toBe("15:00");
  });

  it("understands the Chinese date phrase but returns structured data", () => {
    const result = parseDateTime("明天下午3点", {
      now,
      timezone,
      hours: DEFAULT_HOURS,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date).toBe("2026-11-03");
    expect(result.time).toBe("15:00");
  });

  it("converts a local wall time to UTC correctly", () => {
    const utc = zonedDateTimeToUtc("2026-11-03", "15:00", timezone);
    expect(utc.toISOString()).toBe("2026-11-03T19:00:00.000Z");
  });

  it("labels fixed offset and regional time zones", () => {
    expect(timezoneLabel("Etc/GMT+4")).toBe("UTC-4");
    expect(timezoneLabel("America/New_York")).toMatch(/E[DS]T/);
  });

  it("reports no date for a message without one", () => {
    const result = parseDateTime("hello there", { now, timezone });
    expect(result.ok).toBe(false);
  });
});
