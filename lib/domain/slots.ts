import type { Db } from "@/lib/db/client";
import { getServiceById, getStaffById, getStaffForService } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { AppError } from "@/lib/errors";
import type {
  Appointment,
  AvailabilitySlot,
  BusinessSettings,
  Service,
  Staff,
} from "@/lib/types";

import type { CalendarBusyInterval, CalendarProvider } from "@/lib/calendar/types";
import { formatInTimeZone } from "date-fns-tz";
import {
  addDaysToDateKey,
  dateKeyInZone,
  hhmmFromMinutes,
  minutesFromHHMM,
  openIntervalsFor,
  weekdayForDateKey,
  zonedDateTimeToUtc,
  type TimePeriod,
} from "./dates";

type TimeOff = {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
};

export type AvailabilityResult = {
  date: string;
  timezone: string;
  slots: AvailabilitySlot[];
  closed: boolean;
  reason?: string;
};

export type AvailabilityInput = {
  serviceId: string;
  date: string;
  staffId?: string;
  period?: TimePeriod;
  provider?: CalendarProvider | null;
  now?: Date;
  limit?: number;
};

const MINUTE = 60_000;

function assertDateKey(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError("INVALID_DATE", "Use a date in YYYY-MM-DD format.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppError("INVALID_DATE", "That date does not exist.");
  }
}

function dayBounds(settings: BusinessSettings, date: string): { start: Date; end: Date } {
  const start = zonedDateTimeToUtc(date, "00:00", settings.timezone);
  const nextDate = addDaysToDateKey(date, 1, settings.timezone);
  const end = zonedDateTimeToUtc(nextDate, "00:00", settings.timezone);
  return { start, end };
}

function timeOffForStaff(db: Db, staffIds: string[], startIso: string, endIso: string): TimeOff[] {
  if (!staffIds.length) return [];
  const placeholders = staffIds.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT * FROM staff_time_off
       WHERE staff_id IN (${placeholders}) AND end_at > ? AND start_at < ?`,
    )
    .all(...staffIds, startIso, endIso) as TimeOff[];
}

function overlaps(
  start: Date,
  end: Date,
  existingStart: Date,
  existingEnd: Date,
): boolean {
  return start.getTime() < existingEnd.getTime() && end.getTime() > existingStart.getTime();
}

function isStaffFree(input: {
  staff: Staff;
  service: Service;
  start: Date;
  end: Date;
  appointments: Appointment[];
  timeOff: TimeOff[];
  busy: CalendarBusyInterval[];
  dateKey: string;
  timezone: string;
}): boolean {
  const { staff, service, start, end, appointments, timeOff, busy, dateKey } = input;
  const bufferedEnd = new Date(end.getTime() + service.bufferMin * MINUTE);

  for (const appointment of appointments) {
    if (appointment.staffId !== staff.id) continue;
    const existingStart = new Date(appointment.startAt);
    const existingEnd = new Date(
      new Date(appointment.endAt).getTime() + appointment.bufferMin * MINUTE,
    );
    if (overlaps(start, bufferedEnd, existingStart, existingEnd)) return false;
  }

  for (const off of timeOff) {
    if (off.staff_id !== staff.id) continue;
    if (overlaps(start, bufferedEnd, new Date(off.start_at), new Date(off.end_at))) {
      return false;
    }
  }

  for (const block of busy) {
    if (block.staffId && block.staffId !== staff.id) continue;
    if (block.allDay) {
      const localDate = block.localDate ?? "";
      const localEndDate = block.localEndDate ?? localDate;
      if (localDate && dateKey >= localDate && dateKey < localEndDate) return false;
      continue;
    }
    if (
      overlaps(
        start,
        bufferedEnd,
        new Date(block.startAt),
        new Date(block.endAt),
      )
    ) {
      return false;
    }
  }

  return true;
}

async function busyForDay(
  provider: CalendarProvider | null | undefined,
  start: Date,
  end: Date,
): Promise<CalendarBusyInterval[]> {
  if (!provider) return [];
  return provider.listBusy(start.toISOString(), end.toISOString());
}

function loadCounts(db: Db, staffIds: string[], startIso: string, endIso: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of staffIds) counts.set(id, 0);
  if (!staffIds.length) return counts;
  const placeholders = staffIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT staff_id, COUNT(*) AS count FROM appointments
       WHERE status = 'confirmed' AND staff_id IN (${placeholders})
         AND start_at >= ? AND start_at < ?
       GROUP BY staff_id`,
    )
    .all(...staffIds, startIso, endIso) as Array<{ staff_id: string; count: number }>;
  for (const row of rows) counts.set(row.staff_id, Number(row.count));
  return counts;
}

export async function getAvailability(
  db: Db,
  input: AvailabilityInput,
): Promise<AvailabilityResult> {
  assertDateKey(input.date);
  const settings = getSettings(db);
  const service = getServiceById(db, input.serviceId, true);
  if (!service) {
    throw new AppError("SERVICE_NOT_FOUND", "That service is not available.");
  }

  const allQualified = getStaffForService(db, service.id, true);
  const qualified = input.staffId
    ? allQualified.filter((member) => member.id === input.staffId)
    : allQualified;
  if (!qualified.length) {
    const message = input.staffId
      ? "That team member does not offer this service."
      : "No team member is currently assigned to this service.";
    return { date: input.date, timezone: settings.timezone, slots: [], closed: false, reason: message };
  }

  const weekday = weekdayForDateKey(input.date, settings.timezone);
  const intervals = openIntervalsFor(settings.hours, weekday);
  if (!intervals.length) {
    return {
      date: input.date,
      timezone: settings.timezone,
      slots: [],
      closed: true,
      reason: "The studio is closed on that day.",
    };
  }

  const { start: dayStart, end: dayEnd } = dayBounds(settings, input.date);
  const now = input.now ?? new Date();
  const earliest = new Date(now.getTime() + settings.leadTimeMin * MINUTE);
  const latestDate = addDaysToDateKey(
    dateKeyInZone(now, settings.timezone),
    settings.maxAdvanceDays,
    settings.timezone,
  );
  if (input.date > latestDate) {
    return {
      date: input.date,
      timezone: settings.timezone,
      slots: [],
      closed: false,
      reason: `Bookings are open up to ${settings.maxAdvanceDays} days ahead.`,
    };
  }

  const staffIds = qualified.map((member) => member.id);
  const busy = await busyForDay(input.provider, dayStart, dayEnd);

  const appointments = db
    .prepare(
      `SELECT a.*, c.name AS customer_name, c.phone AS phone,
              s.name AS service_name, s.price_cents AS service_price_cents,
              s.currency AS currency, st.name AS staff_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN services s ON s.id = a.service_id
       JOIN staff st ON st.id = a.staff_id
       WHERE a.status = 'confirmed'
         AND a.staff_id IN (${staffIds.map(() => "?").join(", ")})
         AND a.end_at > ? AND a.start_at < ?`,
    )
    .all(...staffIds, dayStart.toISOString(), dayEnd.toISOString()) as Array<{
    id: string;
    code: string;
    customer_id: string;
    customer_name: string;
    phone: string;
    service_id: string;
    service_name: string;
    service_price_cents: number;
    currency: string;
    staff_id: string;
    staff_name: string;
    start_at: string;
    end_at: string;
    buffer_min: number;
    status: "confirmed";
    source: string;
    notes: string;
    google_event_id: string | null;
    google_calendar_id: string | null;
    sync_status: "local_only" | "synced" | "sync_failed" | "not_configured";
    created_at: string;
    updated_at: string;
  }>;

  const appointmentModels: Appointment[] = appointments.map((row) => ({
    id: row.id,
    code: row.code,
    customerId: row.customer_id,
    customerName: row.customer_name,
    phone: row.phone,
    serviceId: row.service_id,
    serviceName: row.service_name,
    priceCents: Number(row.service_price_cents),
    currency: row.currency,
    staffId: row.staff_id,
    staffName: row.staff_name,
    startAt: row.start_at,
    endAt: row.end_at,
    bufferMin: Number(row.buffer_min),
    status: row.status,
    source: row.source,
    notes: row.notes,
    googleEventId: row.google_event_id,
    googleCalendarId: row.google_calendar_id,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const timeOff = timeOffForStaff(db, staffIds, dayStart.toISOString(), dayEnd.toISOString());
  const counts = loadCounts(db, staffIds, dayStart.toISOString(), dayEnd.toISOString());
  const sortedQualified = [...qualified].sort((a, b) => {
    const diff = (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const periodRange =
    input.period === "morning"
      ? [0, 720]
      : input.period === "afternoon"
        ? [720, 1020]
        : input.period === "evening"
          ? [1020, 1440]
          : [0, 1440];

  const slots: AvailabilitySlot[] = [];
  const limit = Math.min(12, Math.max(1, input.limit ?? 6));

  for (const interval of intervals) {
    const first = Math.ceil(interval.start / settings.slotIntervalMin) * settings.slotIntervalMin;
    const last = interval.end - service.durationMin;
    for (let minute = first; minute <= last; minute += settings.slotIntervalMin) {
      if (minute < periodRange[0] || minute >= periodRange[1]) continue;
      const start = zonedDateTimeToUtc(input.date, hhmmFromMinutes(minute), settings.timezone);
      if (start.getTime() < earliest.getTime()) continue;
      const end = new Date(start.getTime() + service.durationMin * MINUTE);

      const availableStaff = sortedQualified.filter((member) =>
        isStaffFree({
          staff: member,
          service,
          start,
          end,
          appointments: appointmentModels,
          timeOff,
          busy,
          dateKey: input.date,
          timezone: settings.timezone,
        }),
      );
      if (!availableStaff.length) continue;

      slots.push({
        startAt: start.toISOString(),
        startLocal: formatInTimeZone(start, settings.timezone, "yyyy-MM-dd'T'HH:mm"),
        label: formatInTimeZone(start, settings.timezone, "h:mm a"),
        staffIds: availableStaff.map((member) => member.id),
        staffNames: availableStaff.map((member) => member.name),
      });
      if (slots.length >= limit) break;
    }
    if (slots.length >= limit) break;
  }

  return {
    date: input.date,
    timezone: settings.timezone,
    slots,
    closed: false,
    reason: slots.length ? undefined : "No open times on that day. Try another day or a different service.",
  };
}

export async function findNextAvailability(
  db: Db,
  input: {
    serviceId: string;
    fromDate?: string;
    days?: number;
    staffId?: string;
    period?: TimePeriod;
    provider?: CalendarProvider | null;
    now?: Date;
  },
): Promise<{ date: string; slots: AvailabilitySlot[]; timezone: string } | null> {
  const settings = getSettings(db);
  const now = input.now ?? new Date();
  const startDate = input.fromDate ?? dateKeyInZone(now, settings.timezone);
  const days = Math.min(input.days ?? 14, settings.maxAdvanceDays);
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDaysToDateKey(startDate, offset, settings.timezone);
    const result = await getAvailability(db, {
      serviceId: input.serviceId,
      date,
      staffId: input.staffId,
      period: input.period,
      provider: input.provider,
      now,
      limit: 6,
    });
    if (result.slots.length) {
      return { date, slots: result.slots, timezone: result.timezone };
    }
  }
  return null;
}

export type SlotCheckResult =
  | { ok: true; staff: Staff; service: Service }
  | { ok: false; reason: string };

export async function checkSlotAvailability(
  db: Db,
  input: {
    serviceId: string;
    startAt: string;
    staffId?: string;
    provider?: CalendarProvider | null;
    now?: Date;
    excludeAppointmentId?: string;
  },
): Promise<SlotCheckResult> {
  const settings = getSettings(db);
  const service = getServiceById(db, input.serviceId, true);
  if (!service) return { ok: false, reason: "That service is not available." };

  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "That start time is invalid." };
  const dateKey = formatInTimeZone(start, settings.timezone, "yyyy-MM-dd");
  const time = formatInTimeZone(start, settings.timezone, "HH:mm");
  const minutes = minutesFromHHMM(time);
  const weekday = weekdayForDateKey(dateKey, settings.timezone);
  const intervals = openIntervalsFor(settings.hours, weekday);
  if (!intervals.length) return { ok: false, reason: "The studio is closed on that day." };

  const end = new Date(start.getTime() + service.durationMin * MINUTE);
  const endMinutes = minutes + service.durationMin;
  const fits = intervals.some(
    (interval) => minutes >= interval.start && endMinutes <= interval.end,
  );
  if (!fits) return { ok: false, reason: "That time is outside the studio's opening hours." };
  if (minutes % settings.slotIntervalMin !== 0) {
    return { ok: false, reason: "Please choose one of the listed start times." };
  }

  const now = input.now ?? new Date();
  if (start.getTime() < now.getTime() + settings.leadTimeMin * MINUTE) {
    return {
      ok: false,
      reason: `Appointments need at least ${settings.leadTimeMin} minutes of notice.`,
    };
  }
  const latestDate = addDaysToDateKey(
    dateKeyInZone(now, settings.timezone),
    settings.maxAdvanceDays,
    settings.timezone,
  );
  if (dateKey > latestDate) {
    return {
      ok: false,
      reason: `Bookings are open up to ${settings.maxAdvanceDays} days ahead.`,
    };
  }

  const qualified = getStaffForService(db, service.id, true);
  const candidates = input.staffId
    ? qualified.filter((member) => member.id === input.staffId)
    : qualified;
  if (!candidates.length) {
    return { ok: false, reason: "No team member is assigned to that service." };
  }

  const { start: dayStart, end: dayEnd } = dayBounds(settings, dateKey);
  const busy = await busyForDay(input.provider, dayStart, dayEnd);
  const allAppointments = db
    .prepare(
      `SELECT a.*, c.name AS customer_name, c.phone AS phone,
              s.name AS service_name, s.price_cents AS service_price_cents,
              s.currency AS currency, st.name AS staff_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN services s ON s.id = a.service_id
       JOIN staff st ON st.id = a.staff_id
       WHERE a.status = 'confirmed'
         AND a.staff_id IN (${candidates.map(() => "?").join(", ")})
         AND a.end_at > ? AND a.start_at < ?`,
    )
    .all(
      ...candidates.map((member) => member.id),
      dayStart.toISOString(),
      dayEnd.toISOString(),
    ) as Array<{
    id: string;
    code: string;
    customer_id: string;
    customer_name: string;
    phone: string;
    service_id: string;
    service_name: string;
    service_price_cents: number;
    currency: string;
    staff_id: string;
    staff_name: string;
    start_at: string;
    end_at: string;
    buffer_min: number;
    status: "confirmed";
    source: string;
    notes: string;
    google_event_id: string | null;
    google_calendar_id: string | null;
    sync_status: "local_only" | "synced" | "sync_failed" | "not_configured";
    created_at: string;
    updated_at: string;
  }>;

  const appointmentModels = allAppointments
    .filter((row) => row.id !== input.excludeAppointmentId)
    .map((row) => ({
      id: row.id,
      code: row.code,
      customerId: row.customer_id,
      customerName: row.customer_name,
      phone: row.phone,
      serviceId: row.service_id,
      serviceName: row.service_name,
      priceCents: Number(row.service_price_cents),
      currency: row.currency,
      staffId: row.staff_id,
      staffName: row.staff_name,
      startAt: row.start_at,
      endAt: row.end_at,
      bufferMin: Number(row.buffer_min),
      status: row.status,
      source: row.source,
      notes: row.notes,
      googleEventId: row.google_event_id,
      googleCalendarId: row.google_calendar_id,
      syncStatus: row.sync_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) as Appointment[];

  const timeOff = timeOffForStaff(
    db,
    candidates.map((member) => member.id),
    dayStart.toISOString(),
    dayEnd.toISOString(),
  );
  const free = candidates.find((member) =>
    isStaffFree({
      staff: member,
      service,
      start,
      end,
      appointments: appointmentModels,
      timeOff,
      busy,
      dateKey,
      timezone: settings.timezone,
    }),
  );
  if (!free) return { ok: false, reason: "That time was just taken. Please choose another slot." };
  return { ok: true, staff: free, service };
}
