import type { Db } from "@/lib/db/client";
import type { Faq, Service, Staff } from "@/lib/types";

const serviceFields = `id, name, description, duration_min AS durationMin,
  buffer_min AS bufferMin, price_cents AS priceCents, currency, category, color,
  active, sort_order AS sortOrder`;
const staffFields = "s.id, s.name, s.title, s.bio, s.active, s.color";
type ActiveRow<T> = Omit<T, "active"> & { active: number };

function withActive<T extends { active: boolean }>(row: ActiveRow<T>): T {
  return { ...row, active: Boolean(row.active) } as T;
}

export function getServices(db: Db, activeOnly = true): Service[] {
  const rows = db.prepare(`SELECT ${serviceFields} FROM services
    WHERE (? = 0 OR active = 1) ORDER BY sort_order, name`).all(Number(activeOnly));
  return (rows as ActiveRow<Service>[]).map(withActive<Service>);
}

export function getServiceById(db: Db, id: string, activeOnly = false): Service | undefined {
  const row = db.prepare(`SELECT ${serviceFields} FROM services
    WHERE id = ? AND (? = 0 OR active = 1)`).get(id, Number(activeOnly)) as ActiveRow<Service> | undefined;
  return row && withActive<Service>(row);
}

function withServiceIds(db: Db, row: Omit<ActiveRow<Staff>, "serviceIds">): Staff {
  const services = db.prepare("SELECT service_id AS id FROM staff_services WHERE staff_id = ? ORDER BY service_id").all(row.id);
  return { ...row, active: Boolean(row.active), serviceIds: services.map(({ id }) => String(id)) };
}

export function getStaff(db: Db, activeOnly = true): Staff[] {
  const rows = db.prepare(`SELECT ${staffFields} FROM staff s
    WHERE (? = 0 OR s.active = 1) ORDER BY s.name`).all(Number(activeOnly));
  return (rows as Omit<ActiveRow<Staff>, "serviceIds">[]).map((row) => withServiceIds(db, row));
}

export function getStaffById(db: Db, id: string, activeOnly = false): Staff | undefined {
  const row = db.prepare(`SELECT ${staffFields} FROM staff s WHERE s.id = ?
    AND (? = 0 OR s.active = 1)`).get(id, Number(activeOnly)) as Omit<ActiveRow<Staff>, "serviceIds"> | undefined;
  return row && withServiceIds(db, row);
}

export function getStaffForService(db: Db, serviceId: string, activeOnly = true): Staff[] {
  return getStaff(db, activeOnly).filter((staff) => staff.serviceIds.includes(serviceId));
}

export function getFaqs(db: Db, activeOnly = true): Faq[] {
  const rows = db.prepare(`SELECT id, question, answer, keywords, category, sort_order AS sortOrder, active
    FROM faqs WHERE (? = 0 OR active = 1) ORDER BY sort_order, question`).all(Number(activeOnly));
  return (rows as ActiveRow<Faq>[]).map(withActive<Faq>);
}
