import {
  addDaysToDateKey,
  dateKeyInZone,
  zonedDateTimeToUtc,
} from "@/lib/domain/dates";
import {
  DEMO_FAQS,
  DEMO_SERVICES,
  DEMO_STAFF,
  defaultSettings,
} from "@/lib/db/defaults";
import type { BusinessSettings } from "@/lib/types";

import type { Db } from "./client";
import { nowIso, tableCount } from "./utils";

export function seedDatabase(db: Db, options: { demo: boolean }): void {
  const settings = defaultSettings();
  db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('business', ?)").run(
    JSON.stringify(settings),
  );

  if (!options.demo || tableCount(db, "services") > 0) return;

  const insertService = db.prepare(`
    INSERT INTO services
      (id, name, description, duration_min, buffer_min, price_cents, currency, category, color, active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const service of DEMO_SERVICES) {
    insertService.run(
      service.id,
      service.name,
      service.description,
      service.durationMin,
      service.bufferMin,
      service.priceCents,
      service.currency,
      service.category,
      service.color,
      service.active ? 1 : 0,
      service.sortOrder,
    );
  }

  const insertStaff = db.prepare(`
    INSERT INTO staff (id, name, title, bio, active, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertStaffService = db.prepare(
    "INSERT OR IGNORE INTO staff_services(staff_id, service_id) VALUES (?, ?)",
  );
  for (const member of DEMO_STAFF) {
    insertStaff.run(
      member.id,
      member.name,
      member.title,
      member.bio,
      member.active ? 1 : 0,
      member.color,
    );
    for (const serviceId of member.serviceIds) {
      insertStaffService.run(member.id, serviceId);
    }
  }

  const insertFaq = db.prepare(`
    INSERT INTO faqs (id, question, answer, keywords, category, sort_order, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const faq of DEMO_FAQS) {
    insertFaq.run(
      faq.id,
      faq.question,
      faq.answer,
      faq.keywords,
      faq.category,
      faq.sortOrder,
      faq.active ? 1 : 0,
    );
  }

  seedDemoAppointments(db, settings);
}

function seedDemoAppointments(db: Db, settings: BusinessSettings): void {
  if (tableCount(db, "appointments") > 0) return;

  const today = dateKeyInZone(new Date(), settings.timezone);
  const tomorrow = addDaysToDateKey(today, 1, settings.timezone);
  const dayAfter = addDaysToDateKey(today, 2, settings.timezone);

  const demos = [
    {
      seed: "DEMO1",
      name: "Jordan Lee",
      phone: "5550001001",
      serviceId: "svc_facial",
      staffId: "staff_ava",
      date: tomorrow,
      time: "11:00",
      duration: 60,
      buffer: 10,
    },
    {
      seed: "DEMO2",
      name: "Priya Shah",
      phone: "5550001002",
      serviceId: "svc_massage",
      staffId: "staff_noah",
      date: tomorrow,
      time: "15:00",
      duration: 60,
      buffer: 10,
    },
    {
      seed: "DEMO3",
      name: "Samuel Ortiz",
      phone: "5550001003",
      serviceId: "svc_scalp",
      staffId: "staff_mia",
      date: dayAfter,
      time: "14:00",
      duration: 45,
      buffer: 10,
    },
  ];

  const insertCustomer = db.prepare(
    "INSERT INTO customers(id, name, phone, notes, created_at) VALUES (?, ?, ?, '', ?)",
  );
  const insertAppointment = db.prepare(`
    INSERT INTO appointments
      (id, code, customer_id, service_id, staff_id, start_at, end_at, buffer_min, status, source, notes,
       google_event_id, google_calendar_id, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'seed', '', NULL, NULL, 'local_only', ?, ?)
  `);

  for (const demo of demos) {
    const start = zonedDateTimeToUtc(demo.date, demo.time, settings.timezone);
    const end = new Date(start.getTime() + demo.duration * 60_000);
    const customerId = `cust_${demo.seed.toLowerCase()}`;
    const appointmentId = `appt_${demo.seed.toLowerCase()}`;
    const code = `LUMA-${demo.seed}`;
    const createdAt = nowIso();
    insertCustomer.run(customerId, demo.name, demo.phone, createdAt);
    insertAppointment.run(
      appointmentId,
      code,
      customerId,
      demo.serviceId,
      demo.staffId,
      start.toISOString(),
      end.toISOString(),
      demo.buffer,
      createdAt,
      createdAt,
    );
  }
}
