import type { Db } from "@/lib/db/client";
import { getDb, newId, nowIso, withTransaction } from "@/lib/db/client";
import {
  appointmentSummary,
  getAppointmentByCode,
  getAppointmentById,
  getAppointmentsForCustomer,
  getConfirmedAppointmentsForStaffRange,
  insertAppointment,
  updateAppointmentStatus,
  updateAppointmentSync,
  updateAppointmentTime,
  upsertCustomer,
} from "@/lib/data/appointments";
import { getServiceById, getStaffById } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { AppError } from "@/lib/errors";
import type {
  Appointment,
  AppointmentSummary,
  BookingDraft,
  BusinessSettings,
  DraftSummary,
  Service,
  Staff,
} from "@/lib/types";
import type { CalendarEventInput, CalendarProvider } from "@/lib/calendar/types";

import { generateBookingCode } from "./codes";
import {
  formatLocalDateTime,
  formatLocalTime,
} from "./dates";
import { requirePhone, formatPhone, phoneMatches } from "./phone";
import { checkSlotAvailability } from "./slots";

type DraftRow = {
  id: string;
  conversation_id: string;
  service_id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  customer_name: string;
  phone: string;
  notes: string;
  status: BookingDraft["status"];
  expires_at: string;
  confirmed_appointment_id: string | null;
  created_at: string;
};

const DRAFT_TTL_MS = 15 * 60_000;
const MINUTE = 60_000;

function draftFromRow(row: DraftRow): BookingDraft {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    serviceId: row.service_id,
    staffId: row.staff_id,
    startAt: row.start_at,
    endAt: row.end_at,
    customerName: row.customer_name,
    phone: row.phone,
    notes: row.notes,
    status: row.status,
    expiresAt: row.expires_at,
    confirmedAppointmentId: row.confirmed_appointment_id,
  };
}

function getDraft(db: Db, id: string, now = new Date()): BookingDraft | null {
  const row = db.prepare("SELECT * FROM booking_drafts WHERE id = ?").get(id) as
    | DraftRow
    | undefined;
  if (!row) return null;
  const draft = draftFromRow(row);
  if (draft.status === "pending" && new Date(draft.expiresAt).getTime() < now.getTime()) {
    db.prepare("UPDATE booking_drafts SET status = 'expired' WHERE id = ?").run(id);
    return { ...draft, status: "expired" };
  }
  return draft;
}

export function draftSummary(
  db: Db,
  draft: BookingDraft,
): DraftSummary {
  const settings = getSettings(db);
  const service = getServiceById(db, draft.serviceId);
  const staff = getStaffById(db, draft.staffId);
  if (!service || !staff) {
    throw new AppError("DRAFT_INVALID", "This booking draft is no longer valid.");
  }
  return {
    draftId: draft.id,
    serviceId: service.id,
    serviceName: service.name,
    staffId: staff.id,
    staffName: staff.name,
    startAt: draft.startAt,
    endAt: draft.endAt,
    startLocal: formatLocalDateTime(draft.startAt, settings.timezone),
    endLocal: formatLocalTime(draft.endAt, settings.timezone),
    timezone: settings.timezone,
    durationMin: service.durationMin,
    priceCents: service.priceCents,
    currency: service.currency,
    customerName: draft.customerName,
    phone: formatPhone(draft.phone),
    address: settings.address,
    expiresAt: draft.expiresAt,
  };
}

export function calendarEvent(
  settings: BusinessSettings,
  input: {
    code: string;
    customerName: string;
    phone: string;
    notes: string;
    service: Service;
    staff: Staff;
    startAt: string;
    endAt: string;
  },
): CalendarEventInput {
  return {
    summary: `Appointment · ${input.service.name} · ${input.customerName}`,
    description: [
      `Booking code: ${input.code}`,
      `Service: ${input.service.name} (${input.service.durationMin} min)`,
      `Team member: ${input.staff.name}`,
      `Phone: ${formatPhone(input.phone)}`,
      input.notes ? `Notes: ${input.notes}` : "",
      `Created by ${settings.aiName}, the AI receptionist.`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: settings.address,
    startAt: input.startAt,
    endAt: input.endAt,
    timezone: settings.timezone,
    bookingCode: input.code,
    serviceId: input.service.id,
    staffId: input.staff.id,
    customerName: input.customerName,
    phone: input.phone,
    notes: input.notes,
  };
}

function uniqueBookingCode(db: Db): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateBookingCode();
    if (!getAppointmentByCode(db, code)) return code;
  }
  throw new AppError("BOOKING_CODE_FAILED", "Please try booking again.");
}

function hasLocalConflict(
  db: Db,
  staffId: string,
  start: Date,
  end: Date,
  bufferMin: number,
  excludeId?: string,
): boolean {
  const nearby = getConfirmedAppointmentsForStaffRange(
    db,
    staffId,
    new Date(start.getTime() - 24 * 60 * MINUTE).toISOString(),
    new Date(end.getTime() + 24 * 60 * MINUTE).toISOString(),
  );
  return nearby
    .filter((appointment) => appointment.id !== excludeId)
    .some((appointment) => {
    const existingStart = new Date(appointment.startAt);
    const existingEnd = new Date(
      new Date(appointment.endAt).getTime() + appointment.bufferMin * MINUTE,
    );
    const candidateEnd = new Date(end.getTime() + bufferMin * MINUTE);
    return start.getTime() < existingEnd.getTime() && candidateEnd.getTime() > existingStart.getTime();
  });
}

export type PrepareBookingResult = {
  draft: BookingDraft;
  summary: DraftSummary;
};

export async function prepareBooking(
  db: Db,
  input: {
    conversationId: string;
    serviceId: string;
    startAt: string;
    customerName: string;
    phone: string;
    staffId?: string;
    notes?: string;
    provider?: CalendarProvider | null;
    now?: Date;
  },
): Promise<PrepareBookingResult> {
  const name = input.customerName.trim();
  if (name.length < 2 || name.length > 80) {
    throw new AppError(
      "INVALID_NAME",
      "Please share the full name for the appointment (2–80 characters).",
    );
  }
  const phone = requirePhone(input.phone);
  const notes = (input.notes ?? "").trim().slice(0, 500);
  const check = await checkSlotAvailability(db, {
    serviceId: input.serviceId,
    startAt: input.startAt,
    staffId: input.staffId,
    provider: input.provider,
    now: input.now,
  });
  if (!check.ok) {
    throw new AppError("SLOT_UNAVAILABLE", check.reason, 409);
  }

  const service = check.service;
  const staff = check.staff;
  const start = new Date(input.startAt);
  const end = new Date(start.getTime() + service.durationMin * MINUTE);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS).toISOString();

  db.prepare(
    "UPDATE booking_drafts SET status = 'expired' WHERE conversation_id = ? AND status = 'pending'",
  ).run(input.conversationId);

  const draft: BookingDraft = {
    id: newId("draft_"),
    conversationId: input.conversationId,
    serviceId: service.id,
    staffId: staff.id,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    customerName: name,
    phone,
    notes,
    status: "pending",
    expiresAt,
    confirmedAppointmentId: null,
  };

  db.prepare(
    `INSERT INTO booking_drafts
      (id, conversation_id, service_id, staff_id, start_at, end_at, customer_name, phone, notes,
       status, expires_at, confirmed_appointment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?)`,
  ).run(
    draft.id,
    draft.conversationId,
    draft.serviceId,
    draft.staffId,
    draft.startAt,
    draft.endAt,
    draft.customerName,
    draft.phone,
    draft.notes,
    draft.expiresAt,
    nowIso(),
  );

  return { draft, summary: draftSummary(db, draft) };
}

export type ConfirmBookingResult = {
  appointment: Appointment;
  summary: AppointmentSummary;
  googleSynced: boolean;
};

export async function confirmDraft(
  db: Db,
  input: {
    draftId: string;
    provider?: CalendarProvider | null;
    now?: Date;
  },
): Promise<ConfirmBookingResult> {
  const draft = getDraft(db, input.draftId, input.now);
  if (!draft) throw new AppError("DRAFT_NOT_FOUND", "That booking draft could not be found.", 404);
  if (draft.status === "confirmed" && draft.confirmedAppointmentId) {
    const existing = getAppointmentById(db, draft.confirmedAppointmentId);
    if (existing) {
      const settings = getSettings(db);
      return {
        appointment: existing,
        summary: appointmentSummary(existing, settings),
        googleSynced: Boolean(existing.googleEventId),
      };
    }
  }
  if (draft.status !== "pending") {
    throw new AppError(
      "DRAFT_EXPIRED",
      "This booking draft has expired. Please choose a time again.",
      410,
    );
  }

  const check = await checkSlotAvailability(db, {
    serviceId: draft.serviceId,
    startAt: draft.startAt,
    staffId: draft.staffId,
    provider: input.provider,
    now: input.now,
  });
  if (!check.ok) {
    throw new AppError("SLOT_UNAVAILABLE", check.reason, 409);
  }

  const settings = getSettings(db);
  const service = check.service;
  const staff = check.staff;
  const code = uniqueBookingCode(db);
  const start = new Date(draft.startAt);
  const end = new Date(draft.endAt);
  const eventInput = calendarEvent(settings, {
    code,
    customerName: draft.customerName,
    phone: draft.phone,
    notes: draft.notes,
    service,
    staff,
    startAt: draft.startAt,
    endAt: draft.endAt,
  });

  let googleEventId: string | null = null;
  if (input.provider) {
    const created = await input.provider.createEvent(eventInput);
    googleEventId = created.id;
  }

  try {
    const appointment = withTransaction(db, () => {
      if (hasLocalConflict(db, staff.id, start, end, service.bufferMin)) {
        throw new AppError(
          "SLOT_TAKEN",
          "That time was just taken. Please choose another slot.",
          409,
        );
      }
      const customer = upsertCustomer(db, draft.customerName, draft.phone);
      const created = insertAppointment(db, {
        code,
        customerId: customer.id,
        serviceId: service.id,
        staffId: staff.id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        bufferMin: service.bufferMin,
        source: "ai",
        notes: draft.notes,
        googleEventId,
        googleCalendarId: googleEventId ? settings.googleCalendarId : null,
        syncStatus: googleEventId ? "synced" : "local_only",
      });
      db.prepare(
        "UPDATE booking_drafts SET status = 'confirmed', confirmed_appointment_id = ? WHERE id = ?",
      ).run(created.id, draft.id);
      return created;
    });

    return {
      appointment,
      summary: appointmentSummary(appointment, settings),
      googleSynced: Boolean(googleEventId),
    };
  } catch (error) {
    if (input.provider && googleEventId) {
      try {
        await input.provider.deleteEvent(googleEventId);
      } catch {
        // Best effort rollback; the local booking was not confirmed.
      }
    }
    throw error;
  }
}

export type CancelResult =
  | { ok: true; appointment: Appointment; googleSynced: boolean }
  | { ok: false; needsHandoff: true; appointment: Appointment; reason: string };

export async function cancelAppointment(
  db: Db,
  input: {
    code: string;
    phone: string;
    provider?: CalendarProvider | null;
    enforceCutoff?: boolean;
    force?: boolean;
    now?: Date;
  },
): Promise<CancelResult> {
  const appointment = getAppointmentByCode(db, input.code.trim().toUpperCase());
  if (!appointment || !phoneMatches(appointment.phone, input.phone)) {
    throw new AppError(
      "APPOINTMENT_NOT_FOUND",
      "I could not find a matching appointment. Check the booking code and phone number.",
      404,
    );
  }
  if (appointment.status !== "confirmed") {
    throw new AppError("APPOINTMENT_NOT_ACTIVE", "That appointment is not active.", 409);
  }

  const settings = getSettings(db);
  const now = input.now ?? new Date();
  const cutoff =
    new Date(appointment.startAt).getTime() - settings.cancellationCutoffHours * 60 * MINUTE;
  if (input.enforceCutoff && now.getTime() > cutoff) {
    return {
      ok: false,
      needsHandoff: true,
      appointment,
      reason: `This appointment starts within ${settings.cancellationCutoffHours} hours. Please call the studio so a person can help.`,
    };
  }

  if (appointment.googleEventId) {
    if (!input.provider && !input.force) {
      throw new AppError(
        "CALENDAR_NOT_CONNECTED",
        "Google Calendar is not connected, so I cannot safely cancel this synced appointment. Please call the studio.",
        409,
      );
    }
    if (input.provider) {
      await input.provider.deleteEvent(appointment.googleEventId);
    }
  }

  updateAppointmentStatus(db, appointment.id, "cancelled");
  const updated = getAppointmentById(db, appointment.id);
  if (!updated) throw new AppError("CANCEL_FAILED", "The appointment could not be cancelled.");
  return { ok: true, appointment: updated, googleSynced: Boolean(appointment.googleEventId) };
}

export async function rescheduleAppointment(
  db: Db,
  input: {
    code: string;
    phone: string;
    newStartAt: string;
    provider?: CalendarProvider | null;
    now?: Date;
  },
): Promise<{ appointment: Appointment; googleSynced: boolean }> {
  const appointment = getAppointmentByCode(db, input.code.trim().toUpperCase());
  if (!appointment || !phoneMatches(appointment.phone, input.phone)) {
    throw new AppError(
      "APPOINTMENT_NOT_FOUND",
      "I could not find a matching appointment. Check the booking code and phone number.",
      404,
    );
  }
  if (appointment.status !== "confirmed") {
    throw new AppError("APPOINTMENT_NOT_ACTIVE", "That appointment is not active.", 409);
  }
  const settings = getSettings(db);
  const now = input.now ?? new Date();
  const cutoff =
    new Date(appointment.startAt).getTime() - settings.cancellationCutoffHours * 60 * MINUTE;
  if (now.getTime() > cutoff) {
    throw new AppError(
      "CANCELLATION_CUTOFF",
      `This appointment starts within ${settings.cancellationCutoffHours} hours. Please call the studio to change it.`,
      409,
    );
  }

  const service = getServiceById(db, appointment.serviceId);
  const staff = getStaffById(db, appointment.staffId);
  if (!service || !staff) {
    throw new AppError("APPOINTMENT_INVALID", "This appointment can no longer be changed online.");
  }

  const check = await checkSlotAvailability(db, {
    serviceId: service.id,
    startAt: input.newStartAt,
    staffId: staff.id,
    provider: input.provider,
    now: input.now,
    excludeAppointmentId: appointment.id,
  });
  if (!check.ok) {
    throw new AppError("SLOT_UNAVAILABLE", check.reason, 409);
  }

  const newStart = new Date(input.newStartAt);
  const newEnd = new Date(newStart.getTime() + service.durationMin * MINUTE);
  const code = appointment.code;
  const eventInput = calendarEvent(settings, {
    code,
    customerName: appointment.customerName,
    phone: appointment.phone,
    notes: appointment.notes,
    service,
    staff,
    startAt: newStart.toISOString(),
    endAt: newEnd.toISOString(),
  });

  if (appointment.googleEventId && !input.provider) {
    throw new AppError(
      "CALENDAR_NOT_CONNECTED",
      "Google Calendar is not connected, so I cannot safely change this synced appointment. Please call the studio.",
      409,
    );
  }

  let googleEventId = appointment.googleEventId;
  if (input.provider) {
    if (googleEventId) {
      await input.provider.updateEvent(googleEventId, eventInput);
    } else {
      const created = await input.provider.createEvent(eventInput);
      googleEventId = created.id;
    }
  }

  try {
    withTransaction(db, () => {
      if (
        hasLocalConflict(
          db,
          staff.id,
          newStart,
          newEnd,
          service.bufferMin,
          appointment.id,
        )
      ) {
        throw new AppError("SLOT_TAKEN", "That time was just taken. Please choose another slot.", 409);
      }
      updateAppointmentTime(db, appointment.id, newStart.toISOString(), newEnd.toISOString());
      if (googleEventId && googleEventId !== appointment.googleEventId) {
        updateAppointmentSync(db, appointment.id, {
          googleEventId,
          googleCalendarId: settings.googleCalendarId,
          syncStatus: "synced",
        });
      }
    });
  } catch (error) {
    if (input.provider && googleEventId) {
      try {
        await input.provider.updateEvent(
          googleEventId,
          calendarEvent(settings, {
            code,
            customerName: appointment.customerName,
            phone: appointment.phone,
            notes: appointment.notes,
            service,
            staff,
            startAt: appointment.startAt,
            endAt: appointment.endAt,
          }),
        );
      } catch {
        // Best effort rollback; the local appointment remains at its original time.
      }
    }
    throw error;
  }

  const updated = getAppointmentById(db, appointment.id);
  if (!updated) throw new AppError("RESCHEDULE_FAILED", "The appointment could not be changed.");
  return { appointment: updated, googleSynced: Boolean(googleEventId) };
}

export async function syncAppointmentToGoogle(
  db: Db,
  appointment: Appointment,
  provider: CalendarProvider,
): Promise<Appointment> {
  const settings = getSettings(db);
  const service = getServiceById(db, appointment.serviceId);
  const staff = getStaffById(db, appointment.staffId);
  if (!service || !staff) {
    throw new AppError("APPOINTMENT_INVALID", "This appointment is missing its service or team member.");
  }
  const eventInput = calendarEvent(settings, {
    code: appointment.code,
    customerName: appointment.customerName,
    phone: appointment.phone,
    notes: appointment.notes,
    service,
    staff,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
  });
  let eventId = appointment.googleEventId;
  if (eventId) {
    await provider.updateEvent(eventId, eventInput);
  } else {
    const created = await provider.createEvent(eventInput);
    eventId = created.id;
  }
  updateAppointmentSync(db, appointment.id, {
    googleEventId: eventId,
    googleCalendarId: settings.googleCalendarId,
    syncStatus: "synced",
  });
  const updated = getAppointmentById(db, appointment.id);
  if (!updated) throw new AppError("SYNC_FAILED", "The appointment could not be updated.");
  return updated;
}

export function lookupAppointments(
  db: Db,
  input: { phone: string; code?: string },
): Appointment[] {
  const phone = requirePhone(input.phone);
  if (input.code?.trim()) {
    const appointment = getAppointmentByCode(db, input.code.trim().toUpperCase());
    if (!appointment || !phoneMatches(appointment.phone, phone)) return [];
    return [appointment];
  }
  return getAppointmentsForCustomer(db, phone).filter(
    (appointment) => appointment.status === "confirmed",
  );
}
