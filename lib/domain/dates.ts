import * as chrono from "chrono-node";
import {
  addDays,
  differenceInMinutes,
  format,
  isBefore,
  isValid,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

import type { BusinessHours, DayHours } from "@/lib/types";

export type TimePeriod = "morning" | "afternoon" | "evening";

export type ParsedDateTime = {
  ok: true;
  date: string;
  time?: string;
  period?: TimePeriod;
  hasExplicitTime: boolean;
  ambiguity?: "meridiem";
};

export type ParsedDateTimeFailure = {
  ok: false;
  reason: "no_date" | "no_time" | "ambiguous" | "invalid";
};

export type ParseDateTimeOptions = {
  now?: Date;
  timezone: string;
  hours?: BusinessHours;
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dateKeyInZone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

export function formatLocal(date: Date, timezone: string, pattern = "yyyy-MM-dd HH:mm"): string {
  return formatInTimeZone(date, timezone, pattern);
}

export function formatLocalDateTime(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "EEE, MMM d · h:mm a");
}

export function formatLocalDate(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "EEEE, MMMM d");
}

export function formatLocalTime(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "h:mm a");
}

export function formatLongDate(dateKey: string, timezone: string, withWeekday = true): string {
  const utc = fromZonedTime(`${dateKey}T12:00:00`, timezone);
  return formatInTimeZone(utc, timezone, withWeekday ? "EEEE, MMMM d" : "MMMM d");
}

export function timezoneLabel(timezone: string): string {
  const match = /^Etc\/GMT([+-])(\d{1,2})$/.exec(timezone);
  if (match) {
    const sign = match[1] === "+" ? "-" : "+";
    return `UTC${sign}${Number(match[2])}`;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timezone;
  } catch {
    return timezone;
  }
}

export function currentTimeInZone(timezone: string, now = new Date()): string {
  return `${formatInTimeZone(now, timezone, "EEEE, MMMM d, yyyy 'at' h:mm a")} (${timezoneLabel(timezone)})`;
}

export function zonedDateTimeToUtc(dateKey: string, time: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T${time}:00`, timezone);
}

export function dateKeyToUtcNoon(dateKey: string, timezone: string): Date {
  return fromZonedTime(`${dateKey}T12:00:00`, timezone);
}

export function addDaysToDateKey(dateKey: string, days: number, timezone: string): string {
  const noon = dateKeyToUtcNoon(dateKey, timezone);
  return formatInTimeZone(addDays(noon, days), timezone, "yyyy-MM-dd");
}

export function weekdayForDateKey(dateKey: string, timezone: string): number {
  return toZonedTime(dateKeyToUtcNoon(dateKey, timezone), timezone).getDay();
}

export function minutesFromHHMM(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function hhmmFromMinutes(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime12(value: string): string {
  const [hourRaw, minute] = value.split(":").map(Number);
  const hour = hourRaw % 12 || 12;
  const suffix = hourRaw >= 12 ? "PM" : "AM";
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatMinutes12(minutes: number): string {
  return formatTime12(hhmmFromMinutes(minutes));
}

export function dayHoursFor(hours: BusinessHours | undefined, weekday: number): DayHours | undefined {
  if (!hours) return undefined;
  return hours[String(weekday)];
}

export function openIntervalsFor(
  hours: BusinessHours | undefined,
  weekday: number,
): Array<{ start: number; end: number }> {
  const day = dayHoursFor(hours, weekday);
  if (!day || day.closed) return [];
  const open = minutesFromHHMM(day.open);
  const close = minutesFromHHMM(day.close);
  if (close <= open) return [];
  if (day.breakStart && day.breakEnd) {
    const breakStart = minutesFromHHMM(day.breakStart);
    const breakEnd = minutesFromHHMM(day.breakEnd);
    if (breakStart > open && breakEnd < close && breakEnd > breakStart) {
      return [
        { start: open, end: breakStart },
        { start: breakEnd, end: close },
      ];
    }
  }
  return [{ start: open, end: close }];
}

export function isOpenAtMinutes(
  hours: BusinessHours | undefined,
  dateKey: string,
  timezone: string,
  minutes: number,
): boolean {
  const weekday = weekdayForDateKey(dateKey, timezone);
  return openIntervalsFor(hours, weekday).some(
    (interval) => minutes >= interval.start && minutes < interval.end,
  );
}

function referenceDateForZone(now: Date, timezone: string): Date {
  const zoned = toZonedTime(now, timezone);
  return new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    zoned.getHours(),
    zoned.getMinutes(),
    0,
    0,
  );
}

function detectPeriod(text: string): TimePeriod | undefined {
  const lower = text.toLowerCase();
  if (/\b(morning|breakfast)\b/.test(lower)) return "morning";
  if (/\b(afternoon|midday|lunch)\b/.test(lower)) return "afternoon";
  if (/\b(evening|tonight|night)\b/.test(lower)) return "evening";
  return undefined;
}

function chooseMeridiemHour(
  hour: number,
  dateKey: string,
  timezone: string,
  hours: BusinessHours | undefined,
): number | null {
  if (hour === 12) return 12;
  if (hour === 0) return 0;
  if (hour > 12) return hour;

  const am = hour;
  const pm = hour + 12;
  const amValid = hours
    ? isOpenAtMinutes(hours, dateKey, timezone, am * 60)
    : am >= 8 && am < 12;
  const pmValid = hours
    ? isOpenAtMinutes(hours, dateKey, timezone, pm * 60)
    : pm >= 12 && pm < 20;

  if (amValid && !pmValid) return am;
  if (pmValid && !amValid) return pm;
  if (pmValid && amValid) {
    // Appointment context: 1–6 almost always means the afternoon.
    if (hour >= 1 && hour <= 6) return pm;
    return null;
  }
  return null;
}

function parseWith(
  parser: chrono.Chrono,
  text: string,
  refDate: Date,
  timezone: string,
  hours: BusinessHours | undefined,
): ParsedDateTime | undefined {
  const results = parser.parse(text, refDate, { forwardDate: true });
  const result = results[0];
  if (!result) return undefined;

  const start = result.start;
  const dateCertain = start.isCertain("day") || start.isCertain("weekday");
  if (!dateCertain) return undefined;

  const year = start.get("year") ?? refDate.getFullYear();
  const month = (start.get("month") ?? refDate.getMonth() + 1) as number;
  const day = start.get("day") ?? refDate.getDate();
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const period = detectPeriod(text);
  const hourCertain = start.isCertain("hour");
  if (!hourCertain) {
    return {
      ok: true,
      date,
      period,
      hasExplicitTime: false,
    };
  }

  let hour = start.get("hour") ?? 0;
  const minute = start.get("minute") ?? 0;
  const meridiemCertain = start.isCertain("meridiem");
  if (!meridiemCertain && hour > 0 && hour < 12) {
    const resolved = chooseMeridiemHour(hour, date, timezone, hours);
    if (resolved === null) {
      return {
        ok: true,
        date,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        hasExplicitTime: true,
        ambiguity: "meridiem",
      };
    }
    hour = resolved;
  }

  return {
    ok: true,
    date,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    period,
    hasExplicitTime: true,
  };
}

export function parseDateTime(
  text: string,
  options: ParseDateTimeOptions,
): ParsedDateTime | ParsedDateTimeFailure {
  const now = options.now ?? new Date();
  const refDate = referenceDateForZone(now, options.timezone);
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "no_date" };

  const english = parseWith(chrono.en.casual, trimmed, refDate, options.timezone, options.hours);
  if (english) return english;

  const chinese = parseWith(chrono.zh.casual, trimmed, refDate, options.timezone, options.hours);
  if (chinese) return chinese;

  return { ok: false, reason: "no_date" };
}

export function parseDateOnly(
  text: string,
  options: ParseDateTimeOptions,
): { ok: true; date: string } | ParsedDateTimeFailure {
  const parsed = parseDateTime(text, options);
  if (!parsed.ok) return parsed;
  return { ok: true, date: parsed.date };
}

export function validateLocalDateTime(
  dateKey: string,
  time: string,
  timezone: string,
): boolean {
  const date = zonedDateTimeToUtc(dateKey, time, timezone);
  return isValid(date);
}

export function isPastDate(dateKey: string, timezone: string, now = new Date()): boolean {
  return dateKey < dateKeyInZone(now, timezone);
}

export function isBeforeNow(
  dateKey: string,
  time: string,
  timezone: string,
  now = new Date(),
): boolean {
  return isBefore(zonedDateTimeToUtc(dateKey, time, timezone), now);
}

export function minutesBetween(startIso: string, endIso: string): number {
  return differenceInMinutes(new Date(endIso), new Date(startIso));
}

export function formatDateKeyForPrompt(dateKey: string, timezone: string): string {
  const utc = fromZonedTime(`${dateKey}T12:00:00`, timezone);
  return formatInTimeZone(utc, timezone, "EEEE, MMMM d, yyyy");
}

export function formatTimeForPrompt(time: string): string {
  return formatTime12(time);
}

export function currentLocalDateParts(
  timezone: string,
  now = new Date(),
): { dateKey: string; time: string; weekday: number } {
  const zoned = toZonedTime(now, timezone);
  return {
    dateKey: format(zoned, "yyyy-MM-dd"),
    time: format(zoned, "HH:mm"),
    weekday: zoned.getDay(),
  };
}
