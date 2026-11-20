import { modelStatus } from "@/lib/ai/provider";
import { calendarStatus } from "@/lib/calendar/google";
import { newId, withTransaction, type Db } from "@/lib/db/client";
import { addDaysToDateKey, dateKeyInZone, zonedDateTimeToUtc } from "@/lib/domain/dates";
import { AppError } from "@/lib/errors";
import type { Faq, Handoff, Service, Staff } from "@/lib/types";
import { appointmentSummary, getAppointmentById, listAppointments } from "./appointments";
import { getFaqs, getServiceById, getServices, getStaff, getStaffById } from "./catalog";
import { getConversation, getMessages, listConversations } from "./conversations";
import { getSettings } from "./settings";

export type ServiceInput = Omit<Service, "id"> & { staffIds: string[] };
export type StaffInput = Omit<Staff, "id">;
export type FaqInput = Omit<Faq, "id">;

export function createService(db: Db, input: ServiceInput): Service {
  return writeService(db, newId("svc_"), input);
}

export function updateService(db: Db, id: string, input: ServiceInput): Service {
  if (!getServiceById(db, id)) throw new AppError("SERVICE_NOT_FOUND", "Service not found.", 404);
  return writeService(db, id, input);
}

function writeService(db: Db, id: string, input: ServiceInput): Service {
  withTransaction(db, () => {
    db.prepare(`INSERT INTO services(id, name, description, duration_min, buffer_min, price_cents, currency, category, color, active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name,
      description = excluded.description, duration_min = excluded.duration_min, buffer_min = excluded.buffer_min,
      price_cents = excluded.price_cents, currency = excluded.currency, category = excluded.category,
      color = excluded.color, active = excluded.active, sort_order = excluded.sort_order`).run(
      id, input.name, input.description, input.durationMin, input.bufferMin, input.priceCents,
      input.currency, input.category, input.color, Number(input.active), input.sortOrder,
    );
    db.prepare("DELETE FROM staff_services WHERE service_id = ?").run(id);
    const assign = db.prepare("INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)");
    for (const staffId of new Set(input.staffIds)) {
      if (!getStaffById(db, staffId)) throw new AppError("STAFF_NOT_FOUND", "Team member not found.", 404);
      assign.run(staffId, id);
    }
  });
  return getServiceById(db, id)!;
}

export function deactivateService(db: Db, id: string): void {
  db.prepare("UPDATE services SET active = 0 WHERE id = ?").run(id);
}

export function createStaff(db: Db, input: StaffInput): Staff {
  return writeStaff(db, newId("staff_"), input);
}

export function updateStaff(db: Db, id: string, input: StaffInput): Staff {
  if (!getStaffById(db, id)) throw new AppError("STAFF_NOT_FOUND", "Team member not found.", 404);
  return writeStaff(db, id, input);
}

function writeStaff(db: Db, id: string, input: StaffInput): Staff {
  withTransaction(db, () => {
    db.prepare(`INSERT INTO staff(id, name, title, bio, color, active) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, title = excluded.title, bio = excluded.bio,
      color = excluded.color, active = excluded.active`)
      .run(id, input.name, input.title, input.bio, input.color, Number(input.active));
    db.prepare("DELETE FROM staff_services WHERE staff_id = ?").run(id);
    const assign = db.prepare("INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)");
    for (const serviceId of new Set(input.serviceIds)) {
      if (!getServiceById(db, serviceId)) throw new AppError("SERVICE_NOT_FOUND", "Service not found.", 404);
      assign.run(id, serviceId);
    }
  });
  return getStaffById(db, id)!;
}

export function deactivateStaff(db: Db, id: string): void {
  db.prepare("UPDATE staff SET active = 0 WHERE id = ?").run(id);
}

export function createFaq(db: Db, input: FaqInput): Faq {
  const id = newId("faq_");
  db.prepare("INSERT INTO faqs(id, question, answer, keywords, category, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.question, input.answer, input.keywords, input.category, input.sortOrder, Number(input.active));
  return { id, ...input };
}

export function updateFaq(db: Db, id: string, input: FaqInput): Faq {
  const row = db.prepare(`UPDATE faqs SET question = ?, answer = ?, keywords = ?, category = ?, sort_order = ?, active = ?
    WHERE id = ? RETURNING id`).get(input.question, input.answer, input.keywords, input.category, input.sortOrder, Number(input.active), id);
  if (!row) throw new AppError("FAQ_NOT_FOUND", "FAQ not found.", 404);
  return { id, ...input };
}

export function deleteFaq(db: Db, id: string): void {
  db.prepare("DELETE FROM faqs WHERE id = ?").run(id);
}

export function adminAppointmentById(db: Db, id: string) {
  const appointment = getAppointmentById(db, id);
  if (!appointment) throw new AppError("APPOINTMENT_NOT_FOUND", "Appointment not found.", 404);
  return appointment;
}

export function getConversationDetail(db: Db, id: string) {
  const conversation = getConversation(db, id);
  if (!conversation) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation not found.", 404);
  return { conversation, messages: getMessages(db, id, 200) };
}

export function getAdminOverview(db: Db) {
  const settings = getSettings(db);
  const timezone = settings.timezone;
  const now = new Date();
  const today = dateKeyInZone(now, timezone);
  const start = zonedDateTimeToUtc(today, "00:00", timezone).toISOString();
  const tomorrow = zonedDateTimeToUtc(addDaysToDateKey(today, 1, timezone), "00:00", timezone).toISOString();
  const week = zonedDateTimeToUtc(addDaysToDateKey(today, 7, timezone), "00:00", timezone).toISOString();
  const todayAppointments = listAppointments(db, { from: start, to: tomorrow, status: "confirmed" });
  const upcoming = listAppointments(db, { from: now.toISOString(), to: week, status: "confirmed" });
  const services = getServices(db, false);
  const staff = getStaff(db, false);
  const handoffs = db.prepare(`SELECT id, conversation_id AS conversationId, reason, status, created_at AS createdAt
    FROM handoffs WHERE status = 'open' ORDER BY created_at DESC`).all() as Handoff[];
  return {
    settings, timezone, services, staff, handoffs,
    faqs: getFaqs(db, false),
    google: calendarStatus(db),
    ai: modelStatus(),
    appointments: listAppointments(db).map((row) => appointmentSummary(row, settings)),
    todayAppointments: todayAppointments.map((row) => appointmentSummary(row, settings)),
    conversations: listConversations(db),
    stats: { today: todayAppointments.length, upcoming7: upcoming.length, openHandoffs: handoffs.length,
      totalServices: services.filter((service) => service.active).length,
      totalStaff: staff.filter((member) => member.active).length },
  };
}

export type AdminOverview = ReturnType<typeof getAdminOverview>;
