import { openDatabase, type Db } from "@/lib/db/client";
import { defaultSettings } from "@/lib/db/defaults";
import type { BusinessHours } from "@/lib/types";

export const TEST_TIMEZONE = "Etc/GMT+4";

export function testHours(): BusinessHours {
  const day = {
    closed: false,
    open: "10:00",
    close: "19:00",
    breakStart: "13:00",
    breakEnd: "14:00",
  };
  return {
    "0": { ...day },
    "1": { ...day, closed: true },
    "2": { ...day },
    "3": { ...day },
    "4": { ...day },
    "5": { ...day },
    "6": { ...day },
  };
}

export function makeTestDb(): Db {
  const db = openDatabase(":memory:", { seed: false });
  const settings = {
    ...defaultSettings(),
    timezone: TEST_TIMEZONE,
    hours: testHours(),
    leadTimeMin: 120,
    maxAdvanceDays: 60,
    cancellationCutoffHours: 24,
    slotIntervalMin: 30,
  };
  db.prepare("INSERT INTO settings(key, value) VALUES('business', ?)").run(
    JSON.stringify(settings),
  );
  db.prepare(
    `INSERT INTO services
      (id, name, description, duration_min, buffer_min, price_cents, currency, category, color, active, sort_order)
     VALUES ('svc_test', 'Test Facial', 'A test service.', 60, 10, 12000, 'USD', 'Skin', '#c96f4a', 1, 1)`,
  ).run();
  db.prepare(
    `INSERT INTO staff (id, name, title, bio, active, color)
     VALUES ('staff_test', 'Test Artist', 'Esthetician', '', 1, '#7c8f7b')`,
  ).run();
  db.prepare(
    "INSERT INTO staff_services(staff_id, service_id) VALUES ('staff_test', 'svc_test')",
  ).run();
  return db;
}

export function insertAppointment(
  db: Db,
  input: {
    id: string;
    code: string;
    customer: string;
    phone: string;
    startAt: string;
    endAt: string;
  },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO customers(id, name, phone, notes, created_at) VALUES(?, ?, ?, '', ?)`,
  ).run(`cust_${input.id}`, input.customer, input.phone, now);
  db.prepare(
    `INSERT INTO appointments
      (id, code, customer_id, service_id, staff_id, start_at, end_at, buffer_min, status, source, notes,
       google_event_id, google_calendar_id, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, 'svc_test', 'staff_test', ?, ?, 10, 'confirmed', 'test', '', NULL, NULL, 'local_only', ?, ?)`,
  ).run(
    input.id,
    input.code,
    `cust_${input.id}`,
    input.startAt,
    input.endAt,
    now,
    now,
  );
}
