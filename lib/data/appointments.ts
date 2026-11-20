import { newId, nowIso, type Db } from "@/lib/db/client";
import { formatLocalDateTime } from "@/lib/domain/dates";
import { normalizePhone } from "@/lib/domain/phone";
import type { Appointment, AppointmentStatus, AppointmentSummary, BusinessSettings } from "@/lib/types";

const selectAppointment = `SELECT a.id, a.code, a.customer_id AS customerId,
  c.name AS customerName, c.phone, a.service_id AS serviceId, s.name AS serviceName,
  s.price_cents AS priceCents, s.currency, a.staff_id AS staffId, t.name AS staffName,
  a.start_at AS startAt, a.end_at AS endAt, a.buffer_min AS bufferMin,
  a.status, a.source, a.notes, a.google_event_id AS googleEventId,
  a.google_calendar_id AS googleCalendarId, a.sync_status AS syncStatus,
  a.created_at AS createdAt, a.updated_at AS updatedAt
  FROM appointments a JOIN customers c ON c.id = a.customer_id
  JOIN services s ON s.id = a.service_id JOIN staff t ON t.id = a.staff_id`;

export function getAppointmentById(db: Db, id: string): Appointment | undefined {
  return db.prepare(`${selectAppointment} WHERE a.id = ?`).get(id) as Appointment | undefined;
}

export function getAppointmentByCode(db: Db, code: string): Appointment | undefined {
  return db.prepare(`${selectAppointment} WHERE a.code = ?`).get(code.toUpperCase()) as Appointment | undefined;
}

export function getAppointmentsForCustomer(db: Db, phone: string): Appointment[] {
  const normalized = normalizePhone(phone);
  const alternate = normalized.length === 10 ? `1${normalized}` :
    normalized.length === 11 && normalized.startsWith("1") ? normalized.slice(1) : normalized;
  return db.prepare(`${selectAppointment} WHERE c.phone IN (?, ?) ORDER BY a.start_at`)
    .all(normalized, alternate) as Appointment[];
}

export function getConfirmedAppointmentsForStaffRange(db: Db, staffId: string, from: string, to: string): Appointment[] {
  return db.prepare(`${selectAppointment} WHERE a.staff_id = ? AND a.status = 'confirmed'
    AND a.end_at > ? AND a.start_at < ? ORDER BY a.start_at`).all(staffId, from, to) as Appointment[];
}

export function listAppointments(db: Db, options: {
  from?: string;
  to?: string;
  status?: AppointmentStatus;
  limit?: number;
} = {}): Appointment[] {
  return db.prepare(`${selectAppointment} WHERE (? IS NULL OR a.start_at >= ?)
    AND (? IS NULL OR a.start_at < ?) AND (? IS NULL OR a.status = ?)
    ORDER BY a.start_at LIMIT ?`).all(
    options.from ?? null, options.from ?? null, options.to ?? null, options.to ?? null,
    options.status ?? null, options.status ?? null, options.limit ?? 500,
  ) as Appointment[];
}

export function upsertCustomer(db: Db, name: string, phone: string): { id: string } {
  const row = db.prepare(`INSERT INTO customers(id, name, phone, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET name = excluded.name RETURNING id`)
    .get(newId("cust_"), name, normalizePhone(phone), nowIso());
  return { id: String(row?.id) };
}

type SyncFields = Pick<Appointment, "googleEventId" | "googleCalendarId" | "syncStatus">;
type NewAppointment = SyncFields & Pick<Appointment,
  "code" | "customerId" | "serviceId" | "staffId" | "startAt" | "endAt" | "bufferMin" | "source" | "notes">;

export function insertAppointment(db: Db, input: NewAppointment): Appointment {
  const id = newId("appt_");
  const now = nowIso();
  db.prepare(`INSERT INTO appointments(id, code, customer_id, service_id, staff_id, start_at,
    end_at, buffer_min, source, notes, google_event_id, google_calendar_id, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.code, input.customerId, input.serviceId, input.staffId, input.startAt, input.endAt,
    input.bufferMin, input.source, input.notes, input.googleEventId, input.googleCalendarId,
    input.syncStatus, now, now,
  );
  return getAppointmentById(db, id)!;
}

export function updateAppointmentTime(db: Db, id: string, startAt: string, endAt: string): void {
  db.prepare("UPDATE appointments SET start_at = ?, end_at = ?, updated_at = ? WHERE id = ?")
    .run(startAt, endAt, nowIso(), id);
}

export function updateAppointmentStatus(db: Db, id: string, status: AppointmentStatus): void {
  db.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
}

export function updateAppointmentSync(db: Db, id: string, fields: SyncFields): void {
  db.prepare(`UPDATE appointments SET google_event_id = ?, google_calendar_id = ?,
    sync_status = ?, updated_at = ? WHERE id = ?`)
    .run(fields.googleEventId, fields.googleCalendarId, fields.syncStatus, nowIso(), id);
}

export function appointmentSummary(appointment: Appointment, settings: BusinessSettings): AppointmentSummary {
  const { id, code, customerName, phone, serviceName, staffName, startAt, endAt, status, priceCents, currency, syncStatus } = appointment;
  return { id, code, customerName, phone, serviceName, staffName, startAt, endAt, status, priceCents, currency, syncStatus,
    timezone: settings.timezone, address: settings.address,
    startLocal: formatLocalDateTime(startAt, settings.timezone),
    endLocal: formatLocalDateTime(endAt, settings.timezone),
  };
}
