import type { Db } from "@/lib/db/client";
import { defaultSettings } from "@/lib/db/defaults";
import { AppError } from "@/lib/errors";
import type { BusinessSettings } from "@/lib/types";
import { z } from "zod";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(150),
  tagline: z.string().max(300),
  address: z.string().max(500),
  phone: z.string().max(50),
  email: z.string().max(254),
  timezone: z.string().max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  currency: z.string().regex(/^[A-Z]{3}$/),
  hours: z.partialRecord(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.object({
    closed: z.boolean(),
    open: clock,
    close: clock,
    breakStart: clock.or(z.literal("")).optional(),
    breakEnd: clock.or(z.literal("")).optional(),
  })),
  slotIntervalMin: z.number().int().min(1).max(120),
  leadTimeMin: z.number().int().min(0).max(10080),
  maxAdvanceDays: z.number().int().min(1).max(365),
  cancellationCutoffHours: z.number().int().min(0).max(720),
  googleCalendarId: z.string().max(320),
  aiName: z.string().trim().min(1).max(100),
});

export function getSettings(db: Db): BusinessSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'business'").get();
  const defaults = defaultSettings();
  return row ? { ...defaults, ...JSON.parse(String(row.value)) } : defaults;
}

export function saveSettings(patch: Partial<BusinessSettings>, db: Db): BusinessSettings {
  const current = getSettings(db);
  const result = settingsSchema.safeParse({ ...current, ...patch, hours: { ...current.hours, ...patch.hours } });
  if (!result.success) {
    throw new AppError("INVALID_SETTINGS", "Check the business settings and try again.");
  }
  const settings = result.data as BusinessSettings;
  db.prepare(`INSERT INTO settings(key, value) VALUES ('business', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(settings));
  return settings;
}
